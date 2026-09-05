"""Killable evaluation boundary; IPC and child ownership never outlive a claim."""

from __future__ import annotations

import asyncio
import multiprocessing
from collections.abc import Awaitable, Callable
from multiprocessing.connection import Connection
from multiprocessing.process import BaseProcess
from typing import cast


def _evaluate[Argument, Result](
    function: Callable[[Argument], Result],
    argument: Argument,
    pipe: Connection,
    safe_error_types: tuple[type[Exception], ...],
) -> None:
    try:
        try:
            value = function(argument)
        except safe_error_types as error:
            pipe.send(("domain_error", type(error)))
        except TimeoutError:
            pipe.send(("timeout", None))
        except ValueError, TypeError:
            # Validation exceptions may contain private input; never serialize them.
            pipe.send(("invalid", None))
        except BaseException:
            pipe.send(("failed", None))
        else:
            pipe.send(("ok", value))
    finally:
        pipe.close()


async def _reap(process: BaseProcess, receiver: asyncio.Task[object]) -> None:
    if process.is_alive():
        process.kill()
    await asyncio.to_thread(process.join, 2.0)
    if process.is_alive():
        raise RuntimeError("evaluation child could not be reaped")
    await asyncio.gather(receiver, return_exceptions=True)
    process.close()


async def evaluate_isolated[Argument, Result](
    function: Callable[[Argument], Result],
    argument: Argument,
    *,
    timeout_seconds: float,
    safe_error_types: tuple[type[Exception], ...] = (),
) -> Result:
    """Run trusted, picklable work in a spawned child with a hard deadline.

    This is process lifecycle isolation, not a sandbox. No database objects cross
    the boundary. Kill and reap precede cancellation propagation or lease release.
    """
    if timeout_seconds <= 0:
        raise ValueError("evaluation timeout must be positive")
    deadline = asyncio.get_running_loop().time() + timeout_seconds
    context = multiprocessing.get_context("spawn")
    reader, writer = context.Pipe(duplex=False)
    process = context.Process(
        target=_evaluate, args=(function, argument, writer, safe_error_types), daemon=True
    )
    try:
        process.start()
    except BaseException:
        reader.close()
        writer.close()
        process.close()
        raise
    writer.close()
    receiver = asyncio.create_task(asyncio.to_thread(reader.recv))
    try:
        async with asyncio.timeout_at(deadline):
            status, value = cast(tuple[str, object], await asyncio.shield(receiver))
        if status == "domain_error" and value in safe_error_types:
            raise value("isolated execution failed")
        if status == "timeout":
            raise TimeoutError("evaluation deadline exceeded")
        if status == "invalid":
            raise ValueError("evaluation input failed validation")
        if status != "ok":
            raise RuntimeError("evaluation child failed")
        return cast(Result, value)
    except EOFError as error:
        raise RuntimeError("evaluation child exited without a result") from error
    finally:
        cleanup = asyncio.create_task(_reap(process, receiver))
        canceled = False
        try:
            while not cleanup.done():
                try:
                    await asyncio.shield(cleanup)
                except asyncio.CancelledError:
                    canceled = True
            await cleanup
        finally:
            reader.close()
        if canceled:
            raise asyncio.CancelledError


class EvaluationLeaseLost(RuntimeError):
    """Execution stopped before publishing a result after lease renewal failed."""


async def evaluate_with_lease[Argument, Result](
    function: Callable[[Argument], Result],
    argument: Argument,
    *,
    timeout_seconds: float,
    renew_lease: Callable[[], Awaitable[bool]],
    safe_error_types: tuple[type[Exception], ...] = (),
    heartbeat_seconds: float = 5.0,
) -> Result:
    if heartbeat_seconds <= 0:
        raise ValueError("heartbeat interval must be positive")

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(heartbeat_seconds)
            try:
                async with asyncio.timeout(10.0):
                    if not await renew_lease():
                        return
            except Exception:
                return

    evaluation = asyncio.create_task(
        evaluate_isolated(
            function, argument, timeout_seconds=timeout_seconds, safe_error_types=safe_error_types
        )
    )
    renewal = asyncio.create_task(heartbeat())
    try:
        done, _ = await asyncio.wait({evaluation, renewal}, return_when=asyncio.FIRST_COMPLETED)
        if renewal in done:
            raise EvaluationLeaseLost("execution lease renewal failed")
        return await evaluation
    finally:
        for task in (evaluation, renewal):
            if not task.done():
                task.cancel()
        await asyncio.gather(evaluation, renewal, return_exceptions=True)
