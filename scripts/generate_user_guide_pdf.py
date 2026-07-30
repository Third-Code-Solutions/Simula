"""Generate the SIMULA live production user guide as a polished A4 PDF."""

from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "user-guide.pdf"
SIGN_IN_SCREENSHOT = ROOT / "simula-live-signin.png"

PAGE_WIDTH, PAGE_HEIGHT = A4
LEFT = 18 * mm
RIGHT = 18 * mm
TOP = 21 * mm
BOTTOM = 17 * mm
CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT

# Third Code Solutions brand palette, matched to the live corporate site.
INK = HexColor("#0C0814")
MUTED = HexColor("#665E73")
TEAL = HexColor("#7A3EF0")
TEAL_DARK = HexColor("#4D19A8")
MINT = HexColor("#E9DEFF")
MINT_LIGHT = HexColor("#F6F1FF")
CREAM = HexColor("#FCFAFF")
SAND = HexColor("#E7DAFF")
LILAC = HexColor("#F0E9FF")
GRAY = HexColor("#F3F0F7")
RULE = HexColor("#DED6EA")
WHITE = colors.white

BRAND_PURPLE = HexColor("#7A3EF0")
BRAND_PURPLE_DEEP = HexColor("#6424D6")
BRAND_PURPLE_DARK = HexColor("#4D19A8")
BRAND_GRADIENT_START = HexColor("#5526AB")
BRAND_GRADIENT_MIDDLE = HexColor("#601BE6")
BRAND_GRADIENT_END = HexColor("#905AED")


def register_fonts() -> None:
    candidates = {
        "SimulaSans": Path(r"C:\Windows\Fonts\arial.ttf"),
        "SimulaSansBold": Path(r"C:\Windows\Fonts\arialbd.ttf"),
        "SimulaSerif": Path(r"C:\Windows\Fonts\georgia.ttf"),
        "SimulaSerifBold": Path(r"C:\Windows\Fonts\georgiab.ttf"),
    }
    fallbacks = {
        "SimulaSans": "Helvetica",
        "SimulaSansBold": "Helvetica-Bold",
        "SimulaSerif": "Times-Roman",
        "SimulaSerifBold": "Times-Bold",
    }
    for name, path in candidates.items():
        if path.exists():
            pdfmetrics.registerFont(TTFont(name, str(path)))
        else:
            pdfmetrics.registerFontFamily(name, normal=fallbacks[name])


register_fonts()


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="CoverMark",
        fontName="SimulaSansBold",
        fontSize=12,
        leading=14,
        textColor=INK,
        spaceAfter=30,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverKicker",
        fontName="SimulaSansBold",
        fontSize=8,
        leading=10,
        tracking=1.4,
        textColor=TEAL_DARK,
        spaceAfter=10,
        uppercase=True,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverTitle",
        fontName="SimulaSerifBold",
        fontSize=39,
        leading=42,
        textColor=INK,
        spaceAfter=15,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverSubtitle",
        fontName="SimulaSans",
        fontSize=12.2,
        leading=18,
        textColor=INK,
        spaceAfter=16,
    )
)
styles.add(
    ParagraphStyle(
        name="SectionKicker",
        fontName="SimulaSansBold",
        fontSize=7.8,
        leading=10,
        tracking=1.2,
        textColor=TEAL_DARK,
        uppercase=True,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="SectionTitle",
        fontName="SimulaSerifBold",
        fontSize=25,
        leading=29,
        textColor=INK,
        spaceAfter=8,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="SectionLead",
        fontName="SimulaSans",
        fontSize=10.4,
        leading=15.7,
        textColor=MUTED,
        spaceAfter=13,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="H2Custom",
        fontName="SimulaSansBold",
        fontSize=12.5,
        leading=16,
        textColor=INK,
        spaceBefore=9,
        spaceAfter=6,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="H3Custom",
        fontName="SimulaSansBold",
        fontSize=9.6,
        leading=12.5,
        textColor=INK,
        spaceBefore=4,
        spaceAfter=3,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyCustom",
        fontName="SimulaSans",
        fontSize=9.2,
        leading=14.2,
        textColor=INK,
        spaceAfter=6,
        splitLongWords=True,
    )
)
styles.add(
    ParagraphStyle(
        name="BodySmall",
        fontName="SimulaSans",
        fontSize=8.2,
        leading=12.2,
        textColor=INK,
        spaceAfter=4,
        splitLongWords=True,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyMuted",
        fontName="SimulaSans",
        fontSize=8.2,
        leading=12.2,
        textColor=MUTED,
        spaceAfter=4,
        splitLongWords=True,
    )
)
styles.add(
    ParagraphStyle(
        name="BulletCustom",
        parent=styles["BodyCustom"],
        leftIndent=10,
        firstLineIndent=-10,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="BulletSmall",
        parent=styles["BodySmall"],
        leftIndent=9,
        firstLineIndent=-9,
        spaceAfter=2,
    )
)
styles.add(
    ParagraphStyle(
        name="Label",
        fontName="SimulaSansBold",
        fontSize=7.1,
        leading=9,
        tracking=0.8,
        textColor=TEAL_DARK,
        uppercase=True,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="CardTitle",
        fontName="SimulaSansBold",
        fontSize=9.4,
        leading=12,
        textColor=INK,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="TableHead",
        fontName="SimulaSansBold",
        fontSize=7.6,
        leading=9.5,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        name="TableBody",
        fontName="SimulaSans",
        fontSize=7.55,
        leading=10.2,
        textColor=INK,
        splitLongWords=True,
    )
)
styles.add(
    ParagraphStyle(
        name="TableBodySmall",
        fontName="SimulaSans",
        fontSize=7.1,
        leading=9.5,
        textColor=INK,
        splitLongWords=True,
    )
)
styles.add(
    ParagraphStyle(
        name="TOCHeading",
        fontName="SimulaSerifBold",
        fontSize=31,
        leading=35,
        textColor=INK,
        spaceAfter=11,
    )
)
styles.add(
    ParagraphStyle(
        name="Caption",
        fontName="SimulaSans",
        fontSize=7.3,
        leading=10,
        textColor=MUTED,
        alignment=TA_CENTER,
        spaceBefore=4,
        spaceAfter=7,
    )
)
styles.add(
    ParagraphStyle(
        name="RightSmall",
        fontName="SimulaSans",
        fontSize=7.4,
        leading=9.5,
        textColor=MUTED,
        alignment=TA_RIGHT,
    )
)


def p(text: str, style: str = "BodyCustom") -> Paragraph:
    return Paragraph(text, styles[style])


def bullets(items: list[str], *, small: bool = False) -> list[Paragraph]:
    style = "BulletSmall" if small else "BulletCustom"
    return [p(f"- {item}", style) for item in items]


class Rule(Flowable):
    def __init__(self, width: float = CONTENT_WIDTH, color: colors.Color = RULE):
        super().__init__()
        self.width = width
        self.height = 1
        self.color = color

    def draw(self) -> None:
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(0.6)
        self.canv.line(0, 0.5, self.width, 0.5)


def draw_third_code_mark(canvas: Canvas, x: float, y: float, size: float) -> None:
    """Draw the official Third Code gradient mark as resolution-independent vectors."""
    inset = size * 72 / 1024
    mark_size = size * 880 / 1024
    radius = size * 180 / 1024

    canvas.saveState()
    clip = canvas.beginPath()
    clip.roundRect(x + inset, y + inset, mark_size, mark_size, radius)
    canvas.clipPath(clip, stroke=0, fill=0)
    canvas.linearGradient(
        x + inset,
        y + inset,
        x + inset + mark_size,
        y + inset + mark_size,
        [BRAND_GRADIENT_START, BRAND_GRADIENT_MIDDLE, BRAND_GRADIENT_END],
        positions=[0, 0.45, 1],
        extend=True,
    )
    canvas.restoreState()

    slash = canvas.beginPath()
    slash.moveTo(x + size * 560 / 1024, y + size * (1 - 225 / 1024))
    slash.lineTo(x + size * 690 / 1024, y + size * (1 - 225 / 1024))
    slash.lineTo(x + size * 466 / 1024, y + size * (1 - 799 / 1024))
    slash.lineTo(x + size * 336 / 1024, y + size * (1 - 799 / 1024))
    slash.close()
    canvas.setFillColor(WHITE)
    canvas.drawPath(slash, fill=1, stroke=0)


class ThirdCodeLogo(Flowable):
    def __init__(self, mark_size: float = 9 * mm):
        super().__init__()
        self.mark_size = mark_size
        self.width = 62 * mm
        self.height = mark_size

    def draw(self) -> None:
        canvas = self.canv
        draw_third_code_mark(canvas, 0, 0, self.mark_size)
        x = self.mark_size + 3 * mm
        baseline = self.mark_size * 0.46
        font_size = 11.5
        canvas.setFont("SimulaSansBold", font_size)
        canvas.setFillColor(INK)
        canvas.drawString(x, baseline, "Th")
        x += pdfmetrics.stringWidth("Th", "SimulaSansBold", font_size)
        canvas.setFillColor(BRAND_PURPLE)
        canvas.drawString(x, baseline, "/")
        x += pdfmetrics.stringWidth("/", "SimulaSansBold", font_size)
        canvas.setFillColor(INK)
        canvas.drawString(x, baseline, "rd Code")
        canvas.setFont("SimulaSansBold", 4.7)
        canvas.setFillColor(MUTED)
        canvas.drawString(self.mark_size + 3 * mm, baseline - 7, "SOLUTIONS")


class WorkspaceMap(Flowable):
    def __init__(self, width: float):
        super().__init__()
        self.width = width
        self.height = 96 * mm

    def _box(self, x: float, y: float, w: float, h: float, label: str, sub: str) -> None:
        canvas = self.canv
        canvas.setFillColor(WHITE)
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.75)
        canvas.roundRect(x, y, w, h, 4, fill=1, stroke=1)
        canvas.setFillColor(TEAL_DARK)
        canvas.setFont("SimulaSansBold", 6.8)
        canvas.drawString(x + 8, y + h - 13, label.upper())
        canvas.setFillColor(INK)
        canvas.setFont("SimulaSans", 7.5)
        lines = sub.split("|")
        for index, line in enumerate(lines):
            canvas.drawString(x + 8, y + h - 27 - index * 11, line)

    def _arrow(self, x1: float, y1: float, x2: float, y2: float) -> None:
        canvas = self.canv
        canvas.setStrokeColor(TEAL)
        canvas.setFillColor(TEAL)
        canvas.setLineWidth(1)
        canvas.line(x1, y1, x2, y2)
        dx = x2 - x1
        dy = y2 - y1
        length = max((dx * dx + dy * dy) ** 0.5, 1)
        back_x = -dx / length
        back_y = -dy / length
        side_x = -back_y
        side_y = back_x
        canvas.line(x2, y2, x2 + back_x * 5 + side_x * 2.2, y2 + back_y * 5 + side_y * 2.2)
        canvas.line(x2, y2, x2 + back_x * 5 - side_x * 2.2, y2 + back_y * 5 - side_y * 2.2)

    def draw(self) -> None:
        w = self.width
        gap = 10
        box_w = (w - gap * 2) / 3
        box_h = 27 * mm
        y_top = self.height - box_h
        self._box(0, y_top, box_w, box_h, "Organizations", "Choose workspace|or guided setup")
        self._box(
            box_w + gap, y_top, box_w, box_h, "Dashboard", "Metrics, run health,|recent activity"
        )
        self._box(
            (box_w + gap) * 2,
            y_top,
            box_w,
            box_h,
            "Projects",
            "Create or open a|decision rehearsal",
        )
        mid_y = y_top + box_h / 2
        self._arrow(box_w + 2, mid_y, box_w + gap - 2, mid_y)
        self._arrow(box_w * 2 + gap + 2, mid_y, (box_w + gap) * 2 - 2, mid_y)

        middle_w = 68 * mm
        middle_h = 22 * mm
        middle_x = (w - middle_w) / 2
        middle_y = 34 * mm
        self._box(
            middle_x,
            middle_y,
            middle_w,
            middle_h,
            "Project workspace",
            "Edit project, version stimuli,|or launch a run",
        )

        lower_w = (w - gap) / 2
        lower_h = 23 * mm
        y_low = 1 * mm
        self._box(
            0,
            y_low,
            lower_w,
            lower_h,
            "Methodology lab",
            "Audience, frozen config,|zero-cost preview",
        )
        self._box(
            lower_w + gap,
            y_low,
            lower_w,
            lower_h,
            "Run result",
            "Status, demo values,|method and receipt",
        )
        self._arrow(
            (box_w + gap) * 2 + box_w / 2,
            y_top - 2,
            middle_x + middle_w / 2,
            middle_y + middle_h + 2,
        )
        self._arrow(middle_x + middle_w * 0.35, middle_y - 2, lower_w / 2, y_low + lower_h + 2)
        self._arrow(
            middle_x + middle_w * 0.65,
            middle_y - 2,
            lower_w + gap + lower_w / 2,
            y_low + lower_h + 2,
        )


class GuideDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=LEFT,
            rightMargin=RIGHT,
            topMargin=TOP,
            bottomMargin=BOTTOM,
            title="SIMULA Live Production User Guide",
            author="Third Code Solutions Inc.",
            subject="Professional user guide for the SIMULA live production application",
            creator="Third Code Solutions Inc.",
            keywords="SIMULA, user guide, decision rehearsal, production",
        )
        frame = Frame(
            LEFT,
            BOTTOM,
            CONTENT_WIDTH,
            PAGE_HEIGHT - TOP - BOTTOM,
            id="content",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(
            [
                PageTemplate(id="Cover", frames=[frame], onPage=draw_cover_page),
                PageTemplate(id="Content", frames=[frame], onPage=draw_content_page),
            ]
        )

    def afterFlowable(self, flowable: Flowable) -> None:
        if isinstance(flowable, Paragraph) and flowable.style.name == "SectionTitle":
            text = flowable.getPlainText()
            key = f"section-{self.page}-{abs(hash(text))}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=0, closed=False)
            self.notify("TOCEntry", (0, text, self.page, key))


def draw_cover_page(canvas: Canvas, doc: BaseDocTemplate) -> None:
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(MINT)
    canvas.rect(0, 0, PAGE_WIDTH * 0.36, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(TEAL)
    canvas.rect(0, 0, PAGE_WIDTH, 10 * mm, fill=1, stroke=0)
    canvas.setStrokeColor(TEAL_DARK)
    canvas.setLineWidth(1)
    canvas.line(LEFT, PAGE_HEIGHT - 17 * mm, PAGE_WIDTH - RIGHT, PAGE_HEIGHT - 17 * mm)
    canvas.restoreState()


def draw_content_page(canvas: Canvas, doc: BaseDocTemplate) -> None:
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.55)
    canvas.line(LEFT, PAGE_HEIGHT - 13 * mm, PAGE_WIDTH - RIGHT, PAGE_HEIGHT - 13 * mm)
    draw_third_code_mark(canvas, LEFT, PAGE_HEIGHT - 11.7 * mm, 4.5 * mm)
    canvas.setFillColor(INK)
    canvas.setFont("SimulaSansBold", 7.2)
    canvas.drawString(
        LEFT + 6.5 * mm, PAGE_HEIGHT - 9.4 * mm, "SIMULA / LIVE PRODUCTION USER GUIDE"
    )
    canvas.setFillColor(MUTED)
    canvas.setFont("SimulaSans", 7.1)
    canvas.drawString(LEFT, 8 * mm, "simula-iota.vercel.app")
    canvas.drawRightString(PAGE_WIDTH - RIGHT, 8 * mm, f"PAGE {doc.page:02d}")
    canvas.restoreState()


def section(story: list[Flowable], number: str, title: str, lead: str) -> None:
    story.extend(
        [
            PageBreak(),
            p(f"SECTION {number}", "SectionKicker"),
            p(title, "SectionTitle"),
            p(lead, "SectionLead"),
            Rule(),
            Spacer(1, 7),
        ]
    )


def callout(
    title: str,
    body: str,
    *,
    background: colors.Color = MINT_LIGHT,
    accent: colors.Color = TEAL,
) -> Table:
    content = [p(title, "Label"), p(body, "BodySmall")]
    table = Table([[content]], colWidths=[CONTENT_WIDTH], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 0.6, RULE),
                ("LINEBEFORE", (0, 0), (0, -1), 3, accent),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def step_list(items: list[tuple[str, str]]) -> Table:
    rows: list[list[object]] = []
    for index, (title, body) in enumerate(items, start=1):
        number = p(f"{index:02d}", "Label")
        copy = [p(title, "CardTitle"), p(body, "BodySmall")]
        rows.append([number, copy])
    table = Table(rows, colWidths=[13 * mm, CONTENT_WIDTH - 13 * mm], hAlign="LEFT")
    table_style = TableStyle(
        [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]
    )
    for row in range(len(rows) - 1):
        table_style.add("LINEBELOW", (0, row), (-1, row), 0.4, RULE)
    table.setStyle(table_style)
    return table


def cards(cards_data: list[tuple[str, str, colors.Color]], columns: int = 2) -> Table:
    cells: list[tuple[list[Paragraph], colors.Color]] = []
    for title, body, background in cards_data:
        cells.append(([p(title, "CardTitle"), p(body, "BodySmall")], background))
    rows: list[list[list[Paragraph]]] = []
    for start in range(0, len(cells), columns):
        selected_cards = cells[start : start + columns]
        while len(selected_cards) < columns:
            selected_cards.append(([], CREAM))
        rows.append([item[0] for item in selected_cards])
    gap = 7
    col_width = (CONTENT_WIDTH - gap * (columns - 1)) / columns
    data_with_gaps: list[list[object]] = []
    for layout_row in rows:
        expanded: list[object] = []
        for index, cell in enumerate(layout_row):
            if index:
                expanded.append("")
            expanded.append(cell)
        data_with_gaps.append(expanded)
    widths: list[float] = []
    for index in range(columns):
        if index:
            widths.append(gap)
        widths.append(col_width)
    table = Table(data_with_gaps, colWidths=widths, hAlign="LEFT")
    table_style = TableStyle(
        [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]
    )
    for row_index in range(len(rows)):
        source = cells[row_index * columns : (row_index + 1) * columns]
        for col_index, (_, background) in enumerate(source):
            table_col = col_index * 2
            table_style.add(
                "BACKGROUND",
                (table_col, row_index),
                (table_col, row_index),
                background,
            )
            table_style.add(
                "BOX",
                (table_col, row_index),
                (table_col, row_index),
                0.55,
                RULE,
            )
    table.setStyle(table_style)
    return table


def data_table(
    headers: list[str],
    rows: list[list[str]],
    widths: list[float],
    *,
    small: bool = False,
) -> Table:
    body_style = "TableBodySmall" if small else "TableBody"
    data = [[p(header, "TableHead") for header in headers]]
    data.extend([[p(cell, body_style) for cell in row] for row in rows])
    table = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1)
    table_style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), GRAY),
            ("TEXTCOLOR", (0, 0), (-1, 0), INK),
            ("GRID", (0, 0), (-1, -1), 0.45, RULE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    )
    for row in range(1, len(data)):
        if row % 2 == 0:
            table_style.add("BACKGROUND", (0, row), (-1, row), WHITE)
    table.setStyle(table_style)
    return table


def image_panel(path: Path, width: float) -> KeepTogether:
    if not path.exists():
        return KeepTogether([callout("SCREENSHOT UNAVAILABLE", "Live screenshot was not found.")])
    source_width, source_height = ImageReader(str(path)).getSize()
    image = Image(
        str(path),
        width=width,
        height=width * (source_height / source_width),
    )
    frame = Table([[image]], colWidths=[width], hAlign="CENTER")
    frame.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.7, RULE),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return KeepTogether(
        [
            frame,
            p(
                "Live production sign-in surface, verified 22 July 2026.",
                "Caption",
            ),
        ]
    )


def build_story() -> list[Flowable]:
    story: list[Flowable] = []

    # Cover
    story.extend(
        [
            ThirdCodeLogo(),
            Spacer(1, 7.5 * mm),
            p("SIMULA", "CoverMark"),
            Spacer(1, 18.5 * mm),
            p("LIVE PRODUCTION", "CoverKicker"),
            p("User Guide", "CoverTitle"),
            p(
                "A practical guide to decision rehearsal, immutable inputs, bounded demo runs, and inspectable receipts.",
                "CoverSubtitle",
            ),
            Spacer(1, 8 * mm),
            callout(
                "PRODUCTION EDITION",
                "Canonical URL: <link href='https://simula-iota.vercel.app' color='#4D19A8'>simula-iota.vercel.app</link><br/>Verified: 22 July 2026",
                background=WHITE,
                accent=TEAL_DARK,
            ),
            Spacer(1, 24 * mm),
            Rule(),
            Spacer(1, 7 * mm),
            p("Prepared by: <b>Third Code Solutions Inc.</b>", "BodyCustom"),
            p("CEO: <b>Masshi Okubo</b>", "BodyCustom"),
            p("CTO / Lead Developer: <b>Kurt Gavin Gabayan</b>", "BodyCustom"),
            NextPageTemplate("Content"),
        ]
    )

    # Contents
    story.extend(
        [
            PageBreak(),
            p("Contents", "TOCHeading"),
            p(
                "Use this guide in sequence for first-time setup, or jump directly to the workspace surface you need.",
                "SectionLead",
            ),
            Rule(),
            Spacer(1, 8),
        ]
    )
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(
            name="TOCLevel1",
            fontName="SimulaSans",
            fontSize=9.2,
            leading=18,
            leftIndent=0,
            firstLineIndent=0,
            textColor=INK,
            borderWidth=0,
        )
    ]
    story.append(toc)
    story.extend(
        [
            Spacer(1, 9 * mm),
            p("Document control", "H2Custom"),
            data_table(
                ["Item", "Value"],
                [
                    ["Document", "SIMULA Live Production User Guide"],
                    ["Edition", "1.0 - 22 July 2026"],
                    ["Production status", "Live - verified 22 July 2026"],
                    ["Scope", "Current shipped web interface and its user-visible workflows"],
                    [
                        "Boundary",
                        "Experimental decision rehearsal; not human evidence or a population estimate",
                    ],
                ],
                [46 * mm, CONTENT_WIDTH - 46 * mm],
                small=True,
            ),
        ]
    )

    section(
        story,
        "01",
        "Start here",
        "SIMULA helps a team rehearse a decision before field research. It preserves the question, the source text, the method, the run state, and the limits attached to every output.",
    )
    story.extend(
        [
            callout(
                "THE NON-SUBSTITUTION RULE",
                "SIMULA demo outputs estimate nobody. They are experimental prompts for research. Do not present them as survey results, participant opinions, market lift, prediction, confidence intervals, or evidence about a population.",
                background=SAND,
                accent=BRAND_PURPLE_DEEP,
            ),
            Spacer(1, 8),
            p("From the public landing", "H2Custom"),
            *bullets(
                [
                    "Use <b>Open workspace</b> to enter the organization directory. Signed-out visitors are redirected to sign-in.",
                    "The public workflow, evidence library, method, and provenance sections explain the product boundary; they do not create tenant records.",
                ],
                small=True,
            ),
            p("A complete first rehearsal", "H2Custom"),
            step_list(
                [
                    (
                        "Access an authorized account",
                        "Create an account and confirm the email, or sign in with an existing authorized account.",
                    ),
                    (
                        "Create or choose an organization",
                        "Use guided setup for a complete fictional rehearsal, or create an empty workspace.",
                    ),
                    (
                        "Frame the project",
                        "Name the decision objective, then save one or more immutable text stimulus versions.",
                    ),
                    (
                        "Run and inspect",
                        "Launch the deterministic demo run. Read status, result boundaries, limitations, and frozen provenance.",
                    ),
                    (
                        "Return to people",
                        "Use the weak spots and questions to design appropriately recruited human research.",
                    ),
                ]
            ),
            Spacer(1, 8),
            cards(
                [
                    (
                        "Use SIMULA for",
                        "Message rehearsal, assumption checks, reproducible diagnostics, comparison structure, and research-question preparation.",
                        MINT_LIGHT,
                    ),
                    (
                        "Do not use SIMULA for",
                        "Claiming representativeness, replacing participants, inferring individual behavior, or presenting demo values as forecasts.",
                        LILAC,
                    ),
                ]
            ),
        ]
    )

    section(
        story,
        "02",
        "Account access",
        "All workspace routes require a verified Supabase session. Protected pages redirect signed-out visitors to sign-in before tenant data is requested.",
    )
    story.extend(
        [
            image_panel(SIGN_IN_SCREENSHOT, CONTENT_WIDTH),
            p("Create an account", "H2Custom"),
            *bullets(
                [
                    "Open <b>Create account</b>, enter an email address, and use a password with at least 8 characters.",
                    "Confirm the password exactly. After submission, check the email inbox before signing in.",
                    "Account access is authorized prototype access. Membership and role still control each organization.",
                ],
                small=True,
            ),
            p("Sign in or recover access", "H2Custom"),
            *bullets(
                [
                    "Enter the authorized email and password. A successful sign-in is audit-recorded before the workspace opens.",
                    "Use <b>Forgot password?</b> to request a link. The confirmation message does not disclose whether an account exists.",
                    "Open the emailed reset link, enter the new password twice, then sign in again. Expired links require a new request.",
                    "Use <b>Sign out</b> in the workspace header when finished, especially on a shared device.",
                ],
                small=True,
            ),
        ]
    )

    section(
        story,
        "03",
        "Workspace navigation",
        "The left workspace rail changes with context. Breadcrumbs preserve the path back to organizations, projects, and the current rehearsal.",
    )
    story.extend(
        [
            WorkspaceMap(CONTENT_WIDTH),
            Spacer(1, 5),
            cards(
                [
                    (
                        "Workspace",
                        "Organizations lists accessible workspaces. Guided setup starts a complete fictional rehearsal.",
                        MINT_LIGHT,
                    ),
                    (
                        "Organization",
                        "Dashboard shows live operations. Projects opens the organization project directory.",
                        WHITE,
                    ),
                    (
                        "Project",
                        "Project workspace manages details and stimuli. Methodology lab runs a synthetic-cohort preview.",
                        WHITE,
                    ),
                    (
                        "Rehearsal",
                        "Run result shows state, typed demo output, limitations, and frozen provenance.",
                        LILAC,
                    ),
                ]
            ),
            Spacer(1, 8),
            callout(
                "NAVIGATION NOTE",
                "The rail may scroll horizontally on narrow screens. The selected item remains marked, and the page provides a keyboard-accessible skip link to main content.",
            ),
        ]
    )

    section(
        story,
        "04",
        "Organizations and dashboard",
        "An organization is the tenant boundary. Projects, runs, reports, owner controls, and audit evidence remain scoped to the current membership.",
    )
    story.extend(
        [
            p("Create the workspace", "H2Custom"),
            cards(
                [
                    (
                        "Guided rehearsal",
                        "Enter a 2-80 character organization name. SIMULA creates an organization, a fictional campaign project, one immutable stimulus, and a deterministic mock run, then opens the run.",
                        MINT_LIGHT,
                    ),
                    (
                        "Empty workspace",
                        "Create only the organization and initial owner membership. Add projects and source text manually from the dashboard.",
                        WHITE,
                    ),
                ]
            ),
            Spacer(1, 7),
            p("Read the dashboard", "H2Custom"),
            data_table(
                ["Area", "What it shows", "Primary action"],
                [
                    [
                        "Workspace metrics",
                        "Projects, total runs, reports, and feedback records",
                        "Review current volume",
                    ],
                    [
                        "Run health",
                        "Succeeded, active, failed, and completion rate",
                        "Investigate unhealthy runs",
                    ],
                    [
                        "Workflow coverage",
                        "Audience definitions, projects, and report artifacts",
                        "Open project directory",
                    ],
                    [
                        "Recent activity",
                        "Newest projects, runs, and reports",
                        "Open the source item",
                    ],
                    [
                        "Owner controls",
                        "Invitations, feature gates, and audit events",
                        "Manage authorized scope",
                    ],
                ],
                [35 * mm, 83 * mm, CONTENT_WIDTH - 118 * mm],
            ),
            Spacer(1, 7),
            *bullets(
                [
                    "Select <b>Refresh data</b> to request the latest dashboard projection.",
                    "Choose <b>New project</b> when your role can create projects. Viewers receive read-only presentation.",
                    "Use <b>Load more workspaces</b> when the directory has another page.",
                    "A foreign organization identifier does not reveal its data; access fails closed.",
                ]
            ),
        ]
    )

    section(
        story,
        "05",
        "Projects and immutable stimuli",
        "A project frames the decision. A stimulus stores the exact text being rehearsed. Every saved revision becomes a new immutable version with its own checksum.",
    )
    story.extend(
        [
            p("Create and edit a project", "H2Custom"),
            data_table(
                ["Field", "Rule", "Current production scope"],
                [
                    ["Project name", "2-80 characters", "Required"],
                    ["Objective", "Up to 1,000 characters", "Required"],
                    ["Market", "Fixed by the current UI", "Philippines"],
                    ["Language", "Fixed by the current UI", "English"],
                    ["Category", "Fixed by the current UI", "Campaign message"],
                ],
                [40 * mm, 57 * mm, CONTENT_WIDTH - 97 * mm],
            ),
            Spacer(1, 7),
            p("Add source text", "H2Custom"),
            step_list(
                [
                    ("Name the stimulus", "Use a short label from 2 to 80 characters."),
                    (
                        "Enter the exact text",
                        "Maximum 5,000 characters. Do not enter personal, sensitive, or unnecessary confidential data.",
                    ),
                    (
                        "Save the first version",
                        "SIMULA stores the content as immutable source material with a SHA-256 checksum.",
                    ),
                    (
                        "Create a revision",
                        "Enter new version text. Earlier versions and checksums stay unchanged.",
                    ),
                    (
                        "Choose the run version",
                        "Each saved version has its own <b>Run version</b> action when your role can create runs.",
                    ),
                ]
            ),
            Spacer(1, 7),
            callout(
                "CONCURRENT EDITS",
                "Project updates use the current project version. If another change wins first, SIMULA refreshes the project after a version conflict. Review the latest content, then apply the intended change again.",
            ),
        ]
    )

    section(
        story,
        "06",
        "Run a rehearsal",
        "Launching a run freezes the chosen stimulus version, the authored demo audience, the method, the provider configuration, the resource limits, and the code release used for execution.",
    )
    story.extend(
        [
            callout(
                "PRE-RUN DISCLOSURE",
                "The default audience is authored, experimental, and non-representative. Review its kind, version, checksum, limitations, purpose, and prohibited uses before selecting <b>Run version</b>.",
                background=SAND,
                accent=BRAND_PURPLE_DEEP,
            ),
            Spacer(1, 8),
            data_table(
                ["State", "Meaning", "Available user action"],
                [
                    ["Queued", "Durable queue accepted the run", "Wait or cancel"],
                    ["Running", "Deterministic demo worker is processing", "Wait or cancel"],
                    [
                        "Retrying",
                        "Bounded retry; method and configuration do not change",
                        "Wait or cancel",
                    ],
                    [
                        "Cancellation requested",
                        "Durable processing is closing",
                        "Wait for terminal state",
                    ],
                    [
                        "Complete",
                        "Immutable experimental result is ready",
                        "Read result and provenance",
                    ],
                    [
                        "Failed",
                        "Processing stopped without a result",
                        "Review failure and correlation ID",
                    ],
                    ["Canceled", "Run closed without a substitute result", "Return to the project"],
                ],
                [35 * mm, 89 * mm, CONTENT_WIDTH - 124 * mm],
                small=True,
            ),
            Spacer(1, 7),
            *bullets(
                [
                    "The page checks status automatically. A slow-run note means polling continues at a reduced rate.",
                    "Use <b>Cancel run</b> only while queued, running, or retrying. Cancellation and completion race safely; an already committed result is not deleted or relabeled.",
                    "Use <b>Refresh run status</b> if polling stops or an error is shown.",
                    "A failed or canceled run never receives an invented result. Preserve the shown failure code and correlation ID for support.",
                ]
            ),
        ]
    )

    section(
        story,
        "07",
        "Read results and receipts",
        "A completed run separates the typed demo value, synthetic explanation, human-research next step, limitations, and reproducibility receipt.",
    )
    story.extend(
        [
            cards(
                [
                    (
                        "Pipeline demo values",
                        "A whole-percentage authored distribution used to prove the product path. It represents no population.",
                        MINT_LIGHT,
                    ),
                    (
                        "Unavailable is not zero",
                        "Unsupported, missing, suppressed, and unavailable outputs stay explicit. SIMULA does not replace them with 0.",
                        WHITE,
                    ),
                    (
                        "Synthetic rationale",
                        "Generated explanation is marked synthetic and is never formatted as a participant quotation.",
                        LILAC,
                    ),
                    (
                        "Human research next step",
                        "Recommendations direct the team toward appropriately recruited people before acting.",
                        SAND,
                    ),
                ]
            ),
            Spacer(1, 8),
            p("Open the frozen method and provenance", "H2Custom"),
            data_table(
                ["Receipt section", "Inspectable contents"],
                [
                    ["Frozen stimulus", "Exact content, version identifier, and checksum"],
                    [
                        "Authored demo audience",
                        "Kind, version, checksum, limitations, and frozen cells",
                    ],
                    [
                        "Frozen execution",
                        "Method, provider, schema, language, pipeline, release SHA, configuration, seed, and manifest checksum",
                    ],
                    [
                        "Limits and timestamps",
                        "Deadline, attempt and dispatch caps, cost ceiling, size ceiling, creation, terminal, and result times",
                    ],
                    [
                        "Provider receipt",
                        "Successful provider identity, model, template, response schema, finish status, usage, cost, and timing when available",
                    ],
                ],
                [49 * mm, CONTENT_WIDTH - 49 * mm],
                small=True,
            ),
            Spacer(1, 7),
            callout(
                "HISTORICAL RECORDS",
                "If an older run lacks complete provenance or a provider receipt, SIMULA labels it unavailable. It does not reconstruct a historical receipt from current settings.",
            ),
        ]
    )

    section(
        story,
        "08",
        "Methodology lab",
        "The Methodology lab creates a bounded synthetic-cohort diagnostic. It is a zero-cost deterministic preview, not a human study or a market-lift model.",
    )
    story.extend(
        [
            step_list(
                [
                    (
                        "Define rehearsal audience",
                        "Name the audience and enter comma-separated life-stage cell values from the selected population frame. The saved audience is versioned and non-representative.",
                    ),
                    (
                        "Freeze configuration",
                        "Choose an audience version, enter a configuration name, choose a synthetic sample size from 10 to 5,000, and set a deterministic seed.",
                    ),
                    (
                        "Run deterministic preview",
                        "Choose the frozen configuration and a saved stimulus version, then select <b>Run zero-cost preview</b>.",
                    ),
                ]
            ),
            Spacer(1, 8),
            p("Interpret the generated diagnostic", "H2Custom"),
            cards(
                [
                    (
                        "Overall distribution",
                        "Whole-percentage synthetic reaction categories with an experimental notice.",
                        MINT_LIGHT,
                    ),
                    (
                        "Segment visibility",
                        "Supported, suppressed, or unavailable cells remain explicit.",
                        WHITE,
                    ),
                    (
                        "Risk signals",
                        "Heuristic diagnostic values; not probabilities of human behavior.",
                        WHITE,
                    ),
                    (
                        "Rationales and guidance",
                        "Synthetic text, research questions, and limitations - never participant quotes.",
                        LILAC,
                    ),
                    (
                        "Reproducibility receipt",
                        "Output kind, method, provider, cost, population checksum, and output checksum.",
                        SAND,
                    ),
                    (
                        "Variant structure",
                        "With at least two stimuli, group up to eight latest versions for an ordered comparison. No winner is declared.",
                        MINT_LIGHT,
                    ),
                ]
            ),
            Spacer(1, 7),
            callout(
                "ROLE BOUNDARY",
                "Owners and editors can create audiences, configurations, previews, and variant groups. Viewers can inspect the Methodology lab but cannot create or change methodology records.",
            ),
        ]
    )

    section(
        story,
        "09",
        "Owner administration",
        "Owner controls appear below the organization dashboard. Every command is authorized again by the API and database; hiding a control is not the security boundary.",
    )
    story.extend(
        [
            cards(
                [
                    (
                        "01 / Team invitations",
                        "Enter an email and choose viewer or editor. The invitation expires in seven days. Copy the one-time token once and share it only through an approved private channel.",
                        MINT_LIGHT,
                    ),
                    (
                        "02 / Feature gates",
                        "Use a documented lowercase key, provide a change reason up to 500 characters, choose the intended enabled state, then save or toggle the gate.",
                        WHITE,
                    ),
                    (
                        "03 / Audit events",
                        "Review newest restricted domain events: action, source service, outcome, and timestamp.",
                        LILAC,
                    ),
                    (
                        "Methodology snapshot",
                        "Owners also see workspace counts and recent actions in the Methodology lab.",
                        SAND,
                    ),
                ]
            ),
            Spacer(1, 9),
            p("Invitation handling", "H2Custom"),
            *bullets(
                [
                    "Viewer invitations grant read-only workspace access; editor invitations grant create-and-run access after acceptance.",
                    "The token is a credential. Do not place it in tickets, public chat, screenshots, or this guide.",
                    "Pending invitations show email, role, status, and expiry.",
                    "This release has no public token-entry page in the web UI. Follow the approved private invitation procedure or contact the workspace owner.",
                ]
            ),
            p("Feature-gate key format", "H2Custom"),
            callout(
                "VALID FORMAT",
                "Start with a lowercase letter. Use lowercase letters, digits, underscores, or periods only. Maximum length: 64 characters. Use documented keys; an unknown key may be stored without changing product behavior.",
            ),
        ]
    )

    section(
        story,
        "10",
        "Roles and security",
        "Organization role is stored as a membership record and rechecked for every domain request. The browser never supplies its own trusted role.",
    )
    story.extend(
        [
            data_table(
                ["Capability", "Owner", "Editor", "Viewer"],
                [
                    ["Read dashboard, projects, runs, results, and reports", "Yes", "Yes", "Yes"],
                    ["Create and update projects", "Yes", "Yes", "No"],
                    ["Create stimuli, versions, and runs", "Yes", "Yes", "No"],
                    [
                        "Create methodology audiences, configurations, and previews",
                        "Yes",
                        "Yes",
                        "No",
                    ],
                    ["Cancel eligible runs", "Yes", "Yes", "No"],
                    ["Manage invitations, feature gates, and audit/admin data", "Yes", "No", "No"],
                ],
                [91 * mm, 25 * mm, 25 * mm, CONTENT_WIDTH - 141 * mm],
                small=True,
            ),
            Spacer(1, 9),
            p("Security model in plain language", "H2Custom"),
            cards(
                [
                    (
                        "Authenticated API",
                        "Workspace requests carry a verified session. Missing or expired access returns a safe unauthenticated response.",
                        MINT_LIGHT,
                    ),
                    (
                        "Tenant isolation",
                        "Forced row-level security limits visible records to current organization membership.",
                        WHITE,
                    ),
                    (
                        "Least privilege",
                        "The production API and worker use separate restricted database roles. The browser has no direct application-table privileges.",
                        WHITE,
                    ),
                    (
                        "Fail-closed access",
                        "Foreign resources are not disclosed. Unauthorized owner actions return forbidden without mutating domain state.",
                        LILAC,
                    ),
                ]
            ),
            Spacer(1, 8),
            callout(
                "USER RESPONSIBILITY",
                "Use only the minimum data needed for rehearsal. Do not enter personal data, secrets, credentials, regulated records, or sensitive participant information into project objectives or stimuli.",
                background=SAND,
                accent=BRAND_PURPLE_DEEP,
            ),
        ]
    )

    section(
        story,
        "11",
        "Troubleshooting and recovery",
        "SIMULA returns safe problem messages. When a correlation ID appears, preserve it exactly; it lets an authorized operator locate the server-side event without exposing tenant content.",
    )
    story.extend(
        [
            data_table(
                ["What you see", "Likely condition", "What to do"],
                [
                    [
                        "Sent to sign-in",
                        "Session missing or expired",
                        "Sign in again, then return to the protected route",
                    ],
                    [
                        "Current role cannot perform this action",
                        "Viewer or editor attempted a restricted command",
                        "Ask the organization owner to confirm the required role",
                    ],
                    [
                        "Resource not found",
                        "Record is absent or outside visible tenant scope",
                        "Return through the workspace navigation; verify the organization and project",
                    ],
                    [
                        "Version conflict",
                        "Project changed after the page loaded",
                        "Review the refreshed project, then apply the change again",
                    ],
                    [
                        "Quota or rate limit",
                        "Durable limit reached",
                        "Wait for the indicated delay or retire unnecessary work through the approved process",
                    ],
                    [
                        "Run creation paused",
                        "Queue backpressure",
                        "Wait and retry later; do not create repeated duplicate runs",
                    ],
                    [
                        "Dependency unavailable",
                        "Required service cannot be verified safely",
                        "Retry shortly; keep the correlation ID if it repeats",
                    ],
                    [
                        "Output unavailable",
                        "Unsupported, suppressed, missing, or hidden result",
                        "Do not substitute 0 or another value; read the stated reason",
                    ],
                    [
                        "Reset link invalid or expired",
                        "Recovery session is no longer valid",
                        "Request a new password reset link",
                    ],
                ],
                [46 * mm, 55 * mm, CONTENT_WIDTH - 101 * mm],
                small=True,
            ),
            Spacer(1, 8),
            p("Before asking for support", "H2Custom"),
            *bullets(
                [
                    "Record the page, action, approximate time, organization, project, run state, and correlation ID.",
                    "Do not send passwords, access tokens, invitation tokens, full stimuli, or participant data.",
                    "Refresh once when the UI offers a refresh action. Repeated submission can obscure the original failure.",
                    "For a failed run, preserve the failure code and guidance. A new run is a new record, not a repair of the failed one.",
                ]
            ),
        ]
    )

    section(
        story,
        "12",
        "Accessibility and data care",
        "The production interface is responsive and built around semantic controls, announced status, visible focus, and text equivalents for visual values.",
    )
    story.extend(
        [
            p("Keyboard and screen access", "H2Custom"),
            *bullets(
                [
                    "Use the <b>Skip to content</b> link to bypass repeated navigation.",
                    "Tab order follows the page structure. Buttons, links, forms, alerts, progress, and run status have programmatic names or roles.",
                    "Result distributions include a table and do not require color interpretation.",
                    "Loading, error, cancellation, and success changes use live status or alert semantics.",
                    "Reduced-motion preferences are respected, and long identifiers wrap rather than forcing horizontal page overflow.",
                ]
            ),
            p("Responsive use", "H2Custom"),
            cards(
                [
                    (
                        "Desktop",
                        "Workspace navigation remains in a left rail while the main content uses the available width.",
                        MINT_LIGHT,
                    ),
                    (
                        "Mobile",
                        "Navigation becomes a horizontally scrollable rail; cards and forms stack into one readable column.",
                        WHITE,
                    ),
                ]
            ),
            Spacer(1, 8),
            p("Data care checklist", "H2Custom"),
            *bullets(
                [
                    "Use fictional, non-personal content for guided setup and demo rehearsals.",
                    "Keep source text within the intended organization. Confirm the active organization before editing or running.",
                    "Treat checksums and receipts as integrity references, not as proof that a claim is valid.",
                    "Keep real outcomes separate from predictions or synthetic artifacts. Existing results remain immutable.",
                    "Export/share operations may exist at the API boundary, but this production web guide documents only controls present in the shipped UI.",
                ]
            ),
            Spacer(1, 8),
            callout(
                "VALIDATION NOTE",
                "Automated keyboard, responsive, and Axe checks passed for the secured workflow. Independent human screen-reader evidence remains a governance item as of this edition date.",
                background=LILAC,
                accent=BRAND_PURPLE,
            ),
        ]
    )

    section(
        story,
        "13",
        "Quick reference",
        "Use these routes and terms to orient yourself without exposing record identifiers outside the authorized workspace.",
    )
    story.extend(
        [
            p("Primary web routes", "H2Custom"),
            data_table(
                ["Surface", "Route"],
                [
                    ["Public landing", "/"],
                    ["Sign in / create account", "/sign-in  |  /sign-up"],
                    ["Password recovery", "/forgot-password  |  /reset-password"],
                    ["Organizations", "/organizations"],
                    ["Organization dashboard", "/organizations/{organizationId}/dashboard"],
                    ["Projects", "/organizations/{organizationId}/projects"],
                    ["Project workspace", "/projects/{projectId}"],
                    ["Methodology lab", "/projects/{projectId}/methodology"],
                    ["Run result", "/runs/{runId}"],
                ],
                [55 * mm, CONTENT_WIDTH - 55 * mm],
                small=True,
            ),
            Spacer(1, 8),
            p("Essential terms", "H2Custom"),
            cards(
                [
                    (
                        "Decision rehearsal",
                        "A structured way to test framing and expose weak spots before human research.",
                        MINT_LIGHT,
                    ),
                    (
                        "Immutable stimulus",
                        "A saved source-text version that never changes after creation.",
                        WHITE,
                    ),
                    (
                        "Authored demo audience",
                        "A fictional, non-representative fixture used to prove the workflow.",
                        WHITE,
                    ),
                    (
                        "Deterministic run",
                        "The same frozen setup and seed produce the same bounded demo behavior.",
                        LILAC,
                    ),
                    (
                        "Provenance",
                        "The frozen inputs, versions, method, provider, release, limits, and timestamps behind an output.",
                        SAND,
                    ),
                    (
                        "Correlation ID",
                        "A support reference for a safe error or failed run; not a credential.",
                        MINT_LIGHT,
                    ),
                ]
            ),
            Spacer(1, 9),
            callout(
                "FINAL CHECK BEFORE ACTING",
                "Confirm the output kind, experimental label, frozen source version, audience limits, unsupported or suppressed slices, synthetic rationale label, and human-research next step. If any part is unclear, do not treat the result as evidence.",
                background=SAND,
                accent=BRAND_PURPLE_DEEP,
            ),
            Spacer(1, 9),
            p("Edition note", "H2Custom"),
            p(
                "This guide is aligned with the live production web application, verified on 22 July 2026. Signed-out production pages and protected-route redirection were checked live. Authenticated workflows are documented from the shipped UI and the verified secured browser workflow; the production audit did not fabricate a test tenant.",
                "BodySmall",
            ),
            Spacer(1, 8),
            p("Prepared by <b>Third Code Solutions Inc.</b>", "RightSmall"),
            p("Masshi Okubo, CEO", "RightSmall"),
            p("Kurt Gavin Gabayan, CTO / Lead Developer", "RightSmall"),
        ]
    )

    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = GuideDocTemplate(str(OUTPUT))
    doc.multiBuild(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
