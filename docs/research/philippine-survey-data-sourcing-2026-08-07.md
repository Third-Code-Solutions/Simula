# Philippine survey data sourcing for SIMULA

**Research date:** 2026-08-07
**Scope:** Philippine data for population weighting, campaign/message-response calibration, and held-out election backtesting.
**Source rule:** Current primary or official sources only. No broker claims, mirrors, press summaries, or assumed permissions.
**Legal note:** This is a research and acquisition plan, not legal advice. Final contracts, consent language, COMELEC compliance, and Data Privacy Act (DPA) controls need Philippine counsel and SIMULA's Data Protection Officer (DPO).

## Decision

No identified public dataset is sufficient to make SIMULA's campaign/message-response model scientifically green.

The shortest defensible route is:

1. Build the population and electorate frame from PSA/OpenSTAT and COMELEC official aggregates.
2. Commission a Philippine probability-sample, randomized split-ballot message experiment from SWS or Pulse Asia, with deidentified respondent-level delivery and explicit commercial/model-use rights in the contract.
3. Run a faster online-panel pilot through GMO Research & AI only if its statement of work grants the same rights. Treat that pilot as nonprobability and experimental; calibrate it to PSA/COMELEC margins and do not call it nationally representative without supporting design evidence.
4. Keep an untouched respondent/wave holdout. For election backtesting, separately license historical pre-election microdata from SWS or Pulse Asia and score against official COMELEC outcomes. If historical microdata cannot be licensed, use a prospectively sealed future wave; public toplines permit only coarse external checks.

WVS, Asian Barometer, DHS, and ISSP are useful for method development and external attitudinal benchmarks. Their default terms do not authorize commercial SIMULA ingestion, and none is a campaign-message experiment.

## Fit standard

| Code | SIMULA use | Minimum evidence |
|---|---|---|
| **W** | Population weighting | Current, documented target marginals for the relevant population; design and nonresponse weights where respondent microdata are used. |
| **C** | Behavioral calibration | Respondent-level stimulus, randomized exposure or a credible causal design, pre-specified outcomes, assignment metadata, and lawful model-use rights. |
| **B** | Held-out backtesting | Predictions frozen before opening an untouched respondent set, later survey wave, or official election outcome; no tuning on the holdout. |

Attitude surveys without randomized message exposure may inform priors or external validity checks. They do **not** establish message persuasion, vote conversion, virality, or causal campaign impact.

## Source-by-source assessment

### 1. PSA, PSADA, and OpenSTAT

- **Exact data type and Philippine coverage:** PSA publishes official population, labor, household, and socioeconomic tables through its website and OpenSTAT. The current population frame includes the **2024 Census of Population (POPCEN)** count of 112,729,484 as of 2024-07-01, declared official in 2025. PSA's 2026 release reports 75.89 million voting-age persons and 112.33 million household population in 2024. OpenSTAT contains current statistical tables; for example, its Labor Force Survey series was current through May 2026 and notes the January 2026 adoption of 2020-census-based projections. The Philippine Statistical Yearbook provides downloadable demographic and regional tables. ([2024 POPCEN](https://psa.gov.ph/content/2024-census-population-popcen-population-counts-declared-official-president), [2024 age-sex release](https://psa.gov.ph/statistics/population-and-housing), [OpenSTAT LFS example](https://openstat.psa.gov.ph/PXWeb/pxweb/en/DB/DB__1B__LFS/0031B3FKEI3.px/?rxid=c1f8a2e9-f1ba-4de0-abff-c2a4bf559d81), [Philippine Statistical Yearbook](https://psa.gov.ph/philippine-statistical-yearbook))
- **Microdata versus toplines:** OpenSTAT and PSA website tables are aggregate statistics. PSADA is PSA's microdata catalog. Registered users may download public-use files (PUFs) where a study exposes them; other files or special tabulations require a request or controlled access. Availability, variables, and anonymization differ by study. ([PSADA help](https://psada.psa.gov.ph/helpcenter), [how to acquire PSA data](https://psa.gov.ph/how-acquire-data-psa))
- **Access steps:** Create a PSADA account; inspect the study description, questionnaire, data dictionary, and per-study access status; accept the study's terms; download a PUF if enabled. For unavailable variables, census extracts, enclave access, or special tabulations, submit PSA's Data Request Form and research purpose. ([PSADA registration](https://psada.psa.gov.ph/auth/register), [PSADA access conditions](https://psada.psa.gov.ph/access-conditions))
- **License and commercial-use limit:** PSA website statistical tables and datasets are generally under CC BY unless a page says otherwise; attribution, source link, change notice, and retention of technical notes are required. PSADA raw microdata are free where available, but the general conditions authorize only the approved user/organization and prohibit reproducing, distributing, selling, or lending. A representative PUF agreement limits use to statistical/scientific research, aggregate reporting, no reidentification/linkage, and no redistribution. **Do not infer that PSA's website CC BY grant applies to every PSADA PUF.** ([PSA terms](https://psa.gov.ph/terms-of-use), [PSADA access conditions](https://psada.psa.gov.ph/access-conditions), [example PUF terms](https://psada.psa.gov.ph/catalog/NICTHS/about))
- **Sensitive-data concern:** Use only published aggregates or properly anonymized PUFs. Do not attempt respondent linkage, household reidentification, or enrichment with SIMULA user records.
- **Scientific fit:** **W: strong. C: none by itself. B: none for campaign response.** PSA/OpenSTAT should provide post-stratification targets, not persuasion coefficients. PSADA covariates can support methods research if the specific license permits it, but cannot substitute for stimulus-response observations.

### 2. World Values Survey (WVS)

- **Exact data type and current Philippine wave:** Cross-national, nationally representative adult survey microdata covering values, politics, institutions, trust, religion, identity, and social attitudes. The latest completed Philippine entry in WVS Wave 7 is **2019**. Wave 7 covers 2017-2022. WVS Wave 8 is ongoing for 2024-2026; the official Wave 8 page reviewed did not list a Philippine release, so no Philippine Wave 8 availability is claimed here. ([Wave 7 country documentation](https://www.worldvaluessurvey.org/AJDocumentation.jsp?CndWAVE=7), [Wave 7 documentation/downloads](https://www.worldvaluessurvey.org/WVSContents.jsp?CMSID=Documentation), [fieldwork and sampling](https://www.worldvaluessurvey.org/WVSContents.jsp?CMSID=FieldworkSampling), [Wave 8](https://www.worldvaluessurvey.org/WVSContents.jsp?CMSID=wvswave7))
- **Microdata versus toplines:** Harmonized respondent-level files are offered in SPSS, Stata, SAS, R, and Excel formats after registration; online analysis and documentation are also available.
- **Access steps:** Register with WVS, accept the download agreement, select the Wave 7 cross-national or longitudinal file, preserve country/year identifiers, weights, questionnaire version, and citation metadata.
- **License and commercial-use limit:** The standard WVS download license is for **non-profit use**, requires citation, and prohibits redistribution. Commercial SIMULA training, calibration, product embedding, or client delivery requires separate written authorization from the World Values Survey Association. ([WVS download license](https://www.worldvaluessurvey.org/AJDownloadLicense.jsp))
- **Sensitive-data concern:** Political, religious, and other opinion variables may be sensitive personal information under Philippine law if records remain identifiable. Keep the licensed file segregated, do not link respondents, and publish aggregates only.
- **Scientific fit:** **W: secondary only. C: weak prior/benchmark, not causal. B: limited longitudinal external benchmark.** Useful for testing whether SIMULA reproduces broad attitudinal structure. Not suitable for estimating response to a campaign message.

### 3. Asian Barometer Survey (ABS)

- **Exact data type and current Philippine wave:** National probability-sample, face-to-face political-attitudes survey covering democracy, governance, trust, participation, identity, citizenship, and regime evaluation. Philippine **Wave 6 was fielded in October 2021 and became publicly available in March 2026**. The official schedule reports Philippine Wave 7 fieldwork from July through December 2025; no official public Wave 7 dataset release was located as of this review. ([survey schedule](https://asianbarometer.org/survey.jsp), [methods](https://asianbarometer.org/survey.html?page=s40), [questionnaire/topics](https://asianbarometer.org/survey.html?page=s30))
- **Microdata versus toplines:** Country and cross-national respondent microdata are supplied in SPSS and Stata with questionnaires and sampling documentation. Country-specific variables outside the core file must be requested from the country team.
- **Access steps:** Submit the ABS online data application, state the named project and purpose, and have every collaborator apply. Request country-specific variables separately if needed.
- **License and commercial-use limit:** The standard rules limit use to the approved applicant for academic research, education, policy analysis, or another pre-approved purpose; prohibit copying, printing, selling, or supplying the data to others; and prohibit redistribution. Commercial product use is **not established** by the public terms and requires written pre-approval and a separate rights grant. ([ABS data release and rules](https://asianbarometer.org/datar?+page=d10))
- **Sensitive-data concern:** Political attitudes and affiliations can be sensitive. No respondent linkage or individual targeting; retain only licensed variables and aggregates needed for validation.
- **Scientific fit:** **W: moderate with supplied survey weights. C: attitudinal prior only. B: useful across-wave external check.** Strong Philippine political-attitude benchmark, but no randomized message exposure.

### 4. Philippines Demographic and Health Survey (DHS)

- **Exact data type and current Philippine wave:** The latest Standard DHS is the **2022 Philippines National Demographic and Health Survey**, fielded May-June 2022. It sampled 30,372 households and interviewed 27,821 women aged 15-49; it did not include a men's individual survey. Topics are fertility, family planning, maternal/child health, nutrition, violence, HIV knowledge, household conditions, and related demographics. ([DHS survey details](https://dhsprogram.com/methodology/survey/survey-display-603.cfm?showall=yes), [PSA technical notes](https://psa.gov.ph/statistics/technical-notes/168376))
- **Microdata versus toplines:** Registered users can request household, individual, birth, and other recode microdata in major statistical formats. Geographic files are separately controlled. Reports and tables are public. ([2022 Philippines dataset page](https://dhsprogram.com/data/dataset/Philippines_Standard-DHS_2022.cfm))
- **Access steps:** Register with The DHS Program; submit a project title, description, and requested countries/surveys; wait for country-specific approval. GPS access requires an additional acknowledgment. The official instructions state normal review is approximately 24-48 hours but approval is not guaranteed. ([access instructions](https://dhsprogram.com/data/Access-Instructions.cfm))
- **License and commercial-use limit:** DHS data are for legitimate academic research. The terms prohibit use for a marketing or commercial venture, sharing credentials/data, reidentification, and exposing microdata through dashboards. Commercial SIMULA use is not allowed under the standard terms. ([DHS terms of use](https://dhsprogram.com/data/terms-of-use.cfm))
- **Sensitive-data concern:** Contains health, reproductive, violence, and location-related variables with high reidentification harm. GPS files are displaced but remain restricted. Do not bring DHS row data into the SIMULA product.
- **Scientific fit:** **W: narrow demographic/methods value. C: none. B: none for campaigns.** The women-15-49 individual sample is not an electorate frame. DHS is not a political or message-response dataset.

### 5. ISSP through GESIS

- **Exact data type and current Philippine wave:** Cross-national social-attitude modules. The latest Philippine module located is **ISSP 2023 National Identity and Citizenship**, released by GESIS on 2026-03-13 as ZA10010 v1.0.0: 1,800 Philippine respondents, fielded February 2023, with weights. It covers national identity, citizenship, trust, political interest, tolerance, and related attitudes. Recent Philippine modules also include **2022 Family and Changing Gender Roles** (1,500; fielded September 2021) and **2021 Health and Health Care** (1,800; fielded November 2021). ([ISSP 2023](https://www.gesis.org/en/issp/data-and-documentation/national-identity/2023), [ISSP 2022](https://www.gesis.org/en/issp/data-and-documentation/family-and-changing-gender-roles/2022), [ISSP 2021](https://www.gesis.org/en/issp/data-and-documentation/health-and-health-care/2021))
- **Microdata versus toplines:** Harmonized respondent microdata, codebooks, questionnaires, and weights are available through the GESIS Data Archive after account registration. SWS is the Philippine ISSP member and states that original data are held in its data bank. ([ISSP data catalog](https://www.gesis.org/en/issp/data-and-documentation), [ISSP Philippines member page](https://issp.org/member-states/philippines/))
- **Access steps:** Register with GESIS; request/download the named study; record the study number, version, DOI, module, country, and weight. Contact SWS for original national variables not in the harmonized file.
- **License and commercial-use limit:** GESIS's standard use regime is scientific research and teaching, with no redistribution, reidentification, or unauthorized record linkage. Use outside academic research and commercial use require an advance written agreement with GESIS and, where applicable, the depositor. Do not treat a free download as a commercial model license. ([GESIS usage regulations](https://www.gesis.org/fileadmin/admin/Dateikatalog/pdf/sonstiges/20230630_datenservices_usage_regulations.pdf))
- **Sensitive-data concern:** Identity, political, religious, health, and demographic combinations can be sensitive. Do not merge respondent-level ISSP rows with external individual data.
- **Scientific fit:** **W: moderate with module weights. C: prior/benchmark only. B: cross-module or historical external check only.** Strong for testing latent attitude structure; not a campaign-message experiment.

### 6. Social Weather Stations (SWS)

- **Exact data type and current Philippine coverage:** SWS is a Philippine nonprofit social-research institution that runs quarterly national surveys, omnibus and dedicated surveys, election and exit polls, and commissioned studies. A current public example is its June 20-29, 2026 nationwide face-to-face survey of 1,200 adults, allocated 300 each to NCR, Balance Luzon, Visayas, and Mindanao and weighted to PSA 2026 age-sex-area projections. SWS also fields registered-voter and commissioned pre-election questions. ([about and services](https://sws.org.ph/about-sws/), [June 2026 technical details](https://sws.org.ph/social-weather-report-net-satisfaction-with-president-ferdinand-marcos-jr-rises-to-7-in-june-2026-from-15-in-march-2026/), [January 2025 commissioned survey example](https://sws.org.ph/sws-confirms-january-2025-survey-items-for-stratbase-consultancy-on-public-trust-in-ferdinand-marcos-jr-and-sara-duterte/))
- **Microdata versus toplines:** Public releases provide toplines, charts, exact wording, and technical details, not a general open microdata download. SWS's official materials describe a data archive and raw-data access for a charge. The ISSP member page also says SWS may share survey data and may charge a fee. Availability is study-specific. ([SWS 2026 research review and archive contacts](https://sws.org.ph/wp-content/uploads/2026/05/pr20260318-SWS-CPAf-UPLB-Webinar_Mar182026.pdf), [ISSP Philippines member page](https://issp.org/member-states/philippines/))
- **Access steps:** Email `sws_info@sws.org.ph` or the SWS data archive contact named in its official review; identify survey/wave/questions; request codebook, questionnaire, sampling/weighting report, anonymization statement, raw-data fee, and the exact license. For new work, request a dedicated randomized split-ballot experiment and a quote covering design, fieldwork, respondent-level delivery, weighting, and a held-out wave.
- **License and commercial-use limit:** No public blanket license authorizing commercial redistribution or model training was located. Public release does not imply raw-data reuse rights. Contract explicitly for commercial SIMULA calibration, internal model training/testing, derived coefficients, client-facing aggregate outputs, publication, retention, deletion, audit, and prohibited uses. Sponsor permission may govern publication of commissioned items.
- **Sensitive-data concern:** Candidate preference and political affiliation are sensitive personal information when identifiable. Require meaningful deidentification before delivery, minimum-cell rules, no direct identifiers, no contact data, and no individual targeting.
- **Scientific fit:** **W: strong if design/weights supplied. C: one of the strongest identified local probability-sample routes if SWS agrees to field a randomized experiment. B: strong if historical pre-election microdata can be licensed and paired with COMELEC outcomes.** Existing public toplines are only external benchmarks.

### 7. Pulse Asia Research

- **Exact data type and current Philippine coverage:** Pulse Asia conducts nationwide Ulat ng Bayan surveys, national/local pre- and post-election polling, and social-science research. Its technical-details archive lists current and historical national survey rounds. A public February 2025 election report used 2,400 registered voters, face-to-face interviewing, multistage probability sampling, and published its questionnaire. ([about](https://pulseasia.ph/about-us/), [services](https://pulseasia.ph/services/), [survey technical details](https://pulseasia.ph/databank/survey-technical-details/), [February 2025 report](https://pulseasia.ph/wp-content/uploads/2025/05/PB-February-2025-General-Report.pdf))
- **Microdata versus toplines:** Public databank material consists of releases, reports, tables, technical notes, and questionnaires. No official general public microdata download or reusable microdata license was located.
- **Access steps:** Contact Pulse Asia using the official inquiry details in its publications; request either named historical pre-election microdata or a bespoke randomized message experiment. Require the questionnaire, field dates, sampling frame, PSU/stratum identifiers where lawful, base and final weights, disposition/response information, codebook, and deidentified row data.
- **License and commercial-use limit:** No public terms authorizing respondent-level commercial product use were located. Pulse Asia states that publicly disseminated poll results are its own non-commissioned surveys, but publication is not a raw-data license. Commercial calibration and derived SaaS output require a written services/data license. ([statement on public survey results](https://pulseasia.ph/statement-on-the-petition-to-stop-the-publication-of-survey-results/), [official contact publication](https://pulseasia.ph/wp-content/uploads/2025/05/Disclaimer-on-Mindanao-Local-Surveys.pdf))
- **Sensitive-data concern:** Same controls as SWS: deidentify before delivery; no respondent matching, contact lists, or individual-level political targeting; suppress small cells.
- **Scientific fit:** **W: strong if design/weights supplied. C: strong only for a bespoke randomized experiment. B: strong for licensed historical pre-election microdata against COMELEC results.** Public reports support coarse polling benchmarks only.

### 8. Paid Philippines panels with accessible official terms

Only providers for which this review found both official Philippine panel/service evidence and accessible official client terms are included. Inclusion does not certify quality or availability; both still require project-specific due diligence and a signed SOW.

#### GMO Research & AI / ASIA Cloud Panel

- **Exact data type and Philippine coverage:** Commercial opt-in online panel for B2C/B2B surveys. The Philippines country page reports **411,000 verified respondents** and shows substantial composition skew, including 69% women and 51.3% aged 20-29. GMO's homepage reports a different Philippine panel count, so the live feasible count, demographic incidence, device coverage, fraud controls, and completion rate must be confirmed in the quote. ([Philippines panel page](https://gmo-research.ai/en/solutions/audience/Philippines), [company homepage](https://gmo-research.ai/en/))
- **Microdata versus toplines:** Full-service work can include questionnaire management, scripting, hosting, processing, and reporting. Raw respondent-level delivery is not guaranteed by the public page; put it in the statement of work (SOW).
- **Access steps:** Request feasibility and quote for Philippine registered voters/adults; provide quota and randomized-cell design; require unique respondent/quality flags, assignment data, timestamps, device metadata limited to what is necessary, codebook, unweighted and weighted deidentified rows, and fieldwork report.
- **License and commercial-use limit:** GMO's public master services agreement makes the SOW control deliverables, timing, and price. After full payment the client owns deliverables except pre-existing GMO materials, but disclosure is constrained and GMO retains broad reuse rights. The standard text does not clearly grant SIMULA's intended model training, SaaS outputs, publication, third-party/client use, or Philippine cross-border privacy terms. Amend the SOW/DPA to grant those rights and restrict vendor reuse. ([master services agreement](https://gmo-research.ai/en/download_file/955/0), [privacy policy](https://gmo-research.ai/en/privacy), [ESOMAR quality statement](https://gmo-research.ai/en/quality-management/esomar37))
- **Sensitive-data concern:** Confirm the panel's survey consent covers political questions, randomized creative exposure, deidentified delivery to SIMULA, AI/model training and testing if personal data are involved, retention, cross-border transfer, withdrawal, and deletion. Exclude direct identifiers and panel IDs usable outside the project.
- **Scientific fit:** **W: requires PSA/COMELEC calibration; selection coverage remains nonprobability. C: fastest plausible commercial pilot route. B: useful for an independently recruited later wave, but weaker than a probability sample.** Never infer national representativeness from panel size.

#### Kantar Marketplace / Profiles / LifePoints

- **Exact data type and Philippine coverage:** Kantar's official materials list the Philippines among LifePoints panel markets and describe double opt-in members; Marketplace offers standardized concept, idea, and creative testing. ([Philippines office](https://www.kantar.com/locations/philippines), [LifePoints market list and sample description](https://www.kantar.com/campaigns/pf/lifepoints-poll-competition), [Marketplace idea screening](https://www.kantar.com/marketplace/solutions/innovation-and-product-development/idea-screening))
- **Microdata versus toplines:** Standard Marketplace terms provide aggregated final results and expressly say users do not receive respondent data.
- **Access steps:** A normal Marketplace purchase is suitable only for aggregate creative-testing output. For SIMULA calibration, request a custom Profiles/Kantar SOW and ask whether deidentified rows, weights, assignment metadata, codebook, and commercial model rights are available.
- **License and commercial-use limit:** Standard Marketplace rights are internal-business-use only, revocable and non-transferable. The terms prohibit entering outputs into externally hosted or third-party AI/ML systems for training, testing, or synthesis; prohibit third-party services; and restrict publication. **The standard Marketplace product is therefore not suitable for respondent-level SIMULA calibration or SaaS use.** Proceed only if a signed custom SOW expressly supersedes those restrictions. ([Kantar Marketplace terms](https://www.kantar.com/marketplace/Terms-and-Use))
- **Sensitive-data concern:** A custom contract still needs DPA-compliant consent, anonymization, PIC/PIP roles, transfer and deletion terms, and no individual targeting.
- **Scientific fit:** **W: vendor-dependent. C: aggregate creative benchmark under standard terms; respondent-level calibration only under a custom license. B: weak unless a custom later-wave design and data rights are secured.**

## Election-law acquisition and publication boundary

### COMELEC outcomes

COMELEC is the official source for registered-voter, turnout, and election-result records. Its 2025 statistics page publishes registered and actual voters, turnout by age/sex, and locality spreadsheets; its Citizens' Charter describes requests for election documents, canvass records, and statements of votes. Use these data for electorate margins and held-out election outcomes, preserving election, contest, geography, candidate, and version provenance. ([2025 election statistics](https://www.comelec.gov.ph/?r=2025NLE%2FStatistics), [election-document request service](https://www.comelec.gov.ph/?r=AboutCOMELEC%2FCitizensCharter%2FFrontlineServices%2FVotersGeneralPublic), [2022 election portal](https://www.comelec.gov.ph/?r=2022NLE))

### Election-survey disclosure

Section 5 of the Fair Election Act, Republic Act No. 9006, requires a person publishing an election survey during the election period to disclose the sponsor/payer, pollster, field dates, methodology, sample size and areas, exact questions, margin of error, and sponsor contact details. Raw data must be available for inspection, copying, and verification by COMELEC, registered parties, bona fide candidates, or accredited citizens' arms, subject to reasonable copying fees. The Act's publication-blackout rule in section 5.4 was held unconstitutional by the Supreme Court in *SWS v. COMELEC*. ([RA 9006](https://lawphil.net/statutes/repacts/ra2001/ra_9006_2001.html), [Supreme Court decision](https://lawphil.net/judjuris/juri2001/may2001/gr_147571_2001.html))

COMELEC Resolution No. 11117, promulgated 2025-02-19, is officially posted as supplemental survey-publication rules for the 2025 elections and subsequent elections, with a survey-firm registration form. The official pages reviewed did not establish whether every registration provision remained operative after the 2025 election. Before publishing a future election survey, obtain written confirmation from COMELEC's Political Finance and Affairs Department or Philippine election counsel; do not rely on the absence of later official web guidance. ([COMELEC Resolution No. 11117](https://www.comelec.gov.ph/index.html?r=2025NLE%2FResolutions%2Fcom_res_11117))

SIMULA should generate a disclosure packet for every publishable election-survey result: sponsor, payer, pollster, field dates, sampling/weighting method, target population, sample and area allocation, exact stimulus and questions, randomization, base sizes, design effects, uncertainty, nonresponse/limitations, and a controlled raw-verification file.

## Data Privacy Act and NPC controls

- The DPA defines political affiliation, religion, age, marital status, education, health, and other listed attributes as sensitive personal information. Processing sensitive personal information is generally prohibited unless a section 13 exception applies; for a campaign survey, specific informed consent is the defensible default unless counsel documents another basis. Research is not a blanket exemption. ([RA 10173](https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html))
- The DPA IRR requires transparency, legitimate purpose, proportionality, security, retention limits, and data-subject rights. A research transfer from another controller is not automatically lawful because it is useful or publicly accessible. Data subjects must be told about profiling, direct marketing, automated processing, and data sharing where applicable. ([DPA IRR](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/), [right to be informed](https://privacy.gov.ph/the-right-to-be-informed/))
- NPC consent rules require consent to be freely given, specific, informed, granular, and evidenced; withdrawal must be supported. Public availability is not consent. The notice/consent should name creative exposure, political questions, deidentified transfer, model training/testing, derived outputs, recipients, retention, and cross-border processing. ([NPC Circular 2023-04](https://privacy.gov.ph/wp-content/uploads/2023/11/NPC-Circular-No.-2023-04_Guidelines-on-Consent_07Nov2023.pdf))
- NPC election-campaign guidance expressly covers political actors and information-society providers, including online polling/survey providers. It requires lawful, purpose-limited, proportionate processing and accountability by the controlling party. ([NPC Advisory 2021-03](https://privacy.gov.ph/wp-content/uploads/2021/11/Advisory_Election_Campaigning_03-Nov-21-FINAL.pdf))
- NPC AI guidance applies when personal data are used in AI development, training, testing, or deployment. It requires an appropriate lawful basis, transparent explanation, data minimization, accuracy, bias controls, privacy-by-design/default, governance, and data-subject-right mechanisms. Public personal data remain protected. ([NPC Advisory 2024-04](https://privacy.gov.ph/wp-content/uploads/2025/02/Advisory-2024.12.19-Guidelines-on-Artificial-Intelligence-w-SGD.pdf))
- Conduct and document a privacy impact assessment before acquisition. Determine SIMULA/vendor PIC and PIP roles, put processor and data-sharing duties in writing, maintain records of processing, and verify whether the data processing system, DPO, automated decision-making, or profiling must be registered/notified under NPC Circular 2022-04. ([PIA guidelines](https://www.privacy.gov.ph/wp-content/uploads/2022/01/NPC_AdvisoryNo.2017-03.pdf), [NPC Circular 2022-04](https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04-2.pdf))

**Safe product boundary:** SIMULA should receive anonymous or strongly deidentified survey rows, not names, contact details, voter IDs, precise addresses, or reusable panel IDs. Treat pseudonymized or merely deidentified rows as personal data until a documented anonymization assessment establishes that reidentification is not reasonably likely. Store the vendor recontact key outside SIMULA. Prohibit record linkage, reidentification, and person-level political targeting. Use respondents to estimate aggregate distributions and treatment effects, not to decide how to influence named individuals.

## Shortest defensible acquisition plan

### Track A — establish the frame now

1. Version PSA 2024 POPCEN and current age-sex-region/urbanicity tables as the resident-adult frame.
2. Version COMELEC registered-voter, actual-voter, turnout, and official result tables as the electorate/outcome frame.
3. Define target universes separately: residents aged 18+, registered voters, likely voters, and any locality. Never apply one set of weights to all four.
4. Build reproducible raking or multilevel/post-stratification code with weight trimming, effective sample size, design effect, and pre/post-weight balance reports.

### Track B — acquire actual message response

Send the same request for proposal to SWS and Pulse Asia. Send a parallel pilot request to GMO.

The instrument should include:

- baseline candidate/issue attitude, certainty, salience, trust, media use, and demographics needed for weighting;
- randomized exposure to control and named message/creative cells;
- manipulation/attention checks that do not reveal the hypothesis;
- immediate outcomes such as recall, comprehension, credibility, favorability, issue position, vote intention, and action intention;
- delayed recontact outcomes if the design needs persistence rather than immediate reaction;
- assignment probability, exposure completion, order, device/mode, timestamps, response quality, and base/final weight fields;
- exact stimulus archive, questionnaire, translations, codebook, sampling and fieldwork report.

Choose sample size from a prospective power analysis using the smallest effect SIMULA intends to claim, number of experimental cells, design effect, attrition, and multiplicity. Do not choose a sample size from a generic industry number.

### Track C — contract terms that must be explicit

The signed SOW/data license must state:

- named controller/processor roles and lawful basis/consent responsibility;
- Philippine political survey, creative exposure, deidentified transfer, and AI/model training/testing purposes;
- ownership or perpetual commercial license for respondent-level deliverables, derived coefficients, model artifacts, aggregate SaaS outputs, client use, and publication;
- whether subcontractors, hosting countries, and cross-border transfers are allowed;
- no vendor reuse for unrelated clients without a separate lawful basis and consent;
- anonymization/deidentification standard, prohibited identifiers, minimum-cell disclosure, and reidentification ban;
- security controls, breach notice, access logs, audit evidence, retention, return/deletion, and deletion certificate;
- codebook, questionnaire, translations, weights, sample design, quality flags, disposition/response metrics, and versioned corrections;
- sponsor/publication approval, COMELEC disclosure support, raw-verification access, and an indemnity/termination path for unlawful data.

No row enters SIMULA until the DPO and counsel mark the contract, consent, PIA, registration/notification assessment, and transfer controls complete.

### Track D — calibration and untouched backtests

1. Lock a protocol before opening outcomes: estimand, exclusions, weights, transforms, model class, metrics, subgroup policy, and stopping rules.
2. Split by respondent/cluster, not by duplicated response rows. Keep the final holdout inaccessible to model developers.
3. Evaluate discrimination and calibration: Brier/log loss, calibration slope/intercept, reliability curves, interval coverage, effective sample size, and error by pre-specified large subgroups. Suppress unstable small cells.
4. Repeat with multiple fixed random seeds and report dispersion; one favorable seed is not evidence.
5. For election backtesting, freeze predictions using only information available before each historical field/election cutoff. Compare licensed survey-based predictions with official COMELEC results at aligned contest/geography. Report poll-to-election movement and turnout mismatch; do not attribute all error to the model.
6. Preserve one later independent wave as the release gate. A reused or inspected holdout is no longer held out.

## Green gates

| Gate | Green only when |
|---|---|
| **Provenance** | Every table/file has owner, URL or contract, wave, field dates, universe, version, checksum, questionnaire, codebook, and acquisition record. |
| **Rights** | Written terms permit the exact commercial calibration/training/testing, derived-output, SaaS/client, publication, retention, and transfer uses. Free access alone is insufficient. |
| **Privacy** | PIA complete; PIC/PIP roles and DPO set; lawful basis and consent documented; registration/notification assessed; only anonymous/deidentified rows delivered; deletion and rights workflows tested. |
| **Survey design** | Target population and coverage documented; probability design or nonprobability limitation explicit; weights, design effects, nonresponse/quality controls, and effective sample size reported. |
| **Behavioral evidence** | Real Philippine respondents were randomly assigned to archived messages/control; outcomes and analysis were pre-specified; no synthetic respondents are treated as evidence. |
| **Validation** | Repeated seeded runs, locked protocol, untouched respondent/wave holdout, calibration metrics, interval coverage, and historical election backtests pass pre-set thresholds. |
| **Publication** | RA 9006/COMELEC disclosure packet complete; sponsor and exact wording disclosed; verification data can be produced lawfully; privacy-safe cell suppression applied. |
| **Claims** | UI and reports identify source/wave/freshness and say `experimental` or `validated on [named dataset/wave]`; no claim that SIMULA predicts individuals, replaces polling, or proves causal campaign impact beyond the experiment. |

Until all applicable gates pass, the correct SIMULA status is **experimental / data acquisition incomplete**, not green.

## Limitations and unresolved items

- No vendor quote, SOW, DPA, raw-data license, or data delivery was executed in this research. Price, incidence, field time, available historical waves, and rights remain unknown until written offers arrive.
- Public SWS and Pulse Asia releases are not evidence that respondent microdata are available for a requested study or that commercial model use will be licensed.
- WVS, ABS, DHS, and ISSP access can change by version or wave. The specific agreement displayed at download controls; re-check it on acquisition and archive a copy.
- PSA website CC BY terms do not automatically override PSADA study-specific restrictions.
- Official GMO pages displayed inconsistent Philippines panel counts. Panel size is not the eligible count for a given sample and does not establish probability coverage.
- Kantar's public standard terms block the intended respondent-level and externally accessible AI/ML use. Only a signed custom agreement that clearly supersedes those clauses can change that conclusion.
- COMELEC Resolution No. 11117 is posted as applying to subsequent elections, but the current operational status of all registration mechanics was not resolved by the official pages reviewed. Obtain written COMELEC/counsel confirmation before publication.
- Election outcomes are affected by turnout, candidate changes, campaign events, mode, field dates, and undecided-voter movement. Matching a result is not proof that a message caused it.
- Probability samples still have sampling and nonsampling error. Opt-in panels add selection and coverage error that weighting cannot be assumed to remove.
- This review found no lawful public Philippine dataset with randomized campaign creative exposure, respondent-level outcomes, commercial model rights, and a clean future holdout. That dataset must be commissioned or specifically licensed.

## Primary official source register

- **PSA:** [Terms of Use](https://psa.gov.ph/terms-of-use); [PSADA access conditions](https://psada.psa.gov.ph/access-conditions); [PSADA help](https://psada.psa.gov.ph/helpcenter); [PSADA registration](https://psada.psa.gov.ph/auth/register); [how to acquire data](https://psa.gov.ph/how-acquire-data-psa); [2024 POPCEN](https://psa.gov.ph/content/2024-census-population-popcen-population-counts-declared-official-president); [population and housing releases](https://psa.gov.ph/statistics/population-and-housing); [OpenSTAT](https://openstat.psa.gov.ph/); [Statistical Yearbook](https://psa.gov.ph/philippine-statistical-yearbook).
- **WVS:** [download license](https://www.worldvaluessurvey.org/AJDownloadLicense.jsp); [Wave 7 documentation](https://www.worldvaluessurvey.org/WVSContents.jsp?CMSID=Documentation); [Wave 7 country documentation](https://www.worldvaluessurvey.org/AJDocumentation.jsp?CndWAVE=7); [sampling](https://www.worldvaluessurvey.org/WVSContents.jsp?CMSID=FieldworkSampling); [Wave 8](https://www.worldvaluessurvey.org/WVSContents.jsp?CMSID=wvswave7).
- **Asian Barometer:** [survey schedule](https://asianbarometer.org/survey.jsp); [data access and rules](https://asianbarometer.org/datar?+page=d10); [methods](https://asianbarometer.org/survey.html?page=s40); [questionnaires](https://asianbarometer.org/survey.html?page=s30).
- **DHS/PSA:** [2022 dataset](https://dhsprogram.com/data/dataset/Philippines_Standard-DHS_2022.cfm); [survey details](https://dhsprogram.com/methodology/survey/survey-display-603.cfm?showall=yes); [access](https://dhsprogram.com/data/Access-Instructions.cfm); [terms](https://dhsprogram.com/data/terms-of-use.cfm); [PSA technical notes](https://psa.gov.ph/statistics/technical-notes/168376).
- **ISSP/GESIS:** [ISSP catalog](https://www.gesis.org/en/issp/data-and-documentation); [2023 module](https://www.gesis.org/en/issp/data-and-documentation/national-identity/2023); [Philippines member](https://issp.org/member-states/philippines/); [GESIS usage regulations](https://www.gesis.org/fileadmin/admin/Dateikatalog/pdf/sonstiges/20230630_datenservices_usage_regulations.pdf).
- **SWS:** [about/services](https://sws.org.ph/about-sws/); [June 2026 release](https://sws.org.ph/social-weather-report-net-satisfaction-with-president-ferdinand-marcos-jr-rises-to-7-in-june-2026-from-15-in-march-2026/); [archive/access review](https://sws.org.ph/wp-content/uploads/2026/05/pr20260318-SWS-CPAf-UPLB-Webinar_Mar182026.pdf).
- **Pulse Asia:** [about](https://pulseasia.ph/about-us/); [services](https://pulseasia.ph/services/); [technical-details archive](https://pulseasia.ph/databank/survey-technical-details/); [February 2025 report](https://pulseasia.ph/wp-content/uploads/2025/05/PB-February-2025-General-Report.pdf).
- **COMELEC/Lawphil:** [RA 9006](https://lawphil.net/statutes/repacts/ra2001/ra_9006_2001.html); [SWS v. COMELEC](https://lawphil.net/judjuris/juri2001/may2001/gr_147571_2001.html); [Resolution No. 11117](https://www.comelec.gov.ph/index.html?r=2025NLE%2FResolutions%2Fcom_res_11117); [2025 election statistics](https://www.comelec.gov.ph/?r=2025NLE%2FStatistics).
- **NPC/Lawphil:** [RA 10173](https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html); [DPA IRR](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/); [Consent Circular 2023-04](https://privacy.gov.ph/wp-content/uploads/2023/11/NPC-Circular-No.-2023-04_Guidelines-on-Consent_07Nov2023.pdf); [Election Campaign Advisory 2021-03](https://privacy.gov.ph/wp-content/uploads/2021/11/Advisory_Election_Campaigning_03-Nov-21-FINAL.pdf); [AI Advisory 2024-04](https://privacy.gov.ph/wp-content/uploads/2025/02/Advisory-2024.12.19-Guidelines-on-Artificial-Intelligence-w-SGD.pdf); [PIA Advisory 2017-03](https://www.privacy.gov.ph/wp-content/uploads/2022/01/NPC_AdvisoryNo.2017-03.pdf); [Registration Circular 2022-04](https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04-2.pdf).
- **Paid panels:** GMO [Philippines panel](https://gmo-research.ai/en/solutions/audience/Philippines), [MSA](https://gmo-research.ai/en/download_file/955/0), [privacy](https://gmo-research.ai/en/privacy), [ESOMAR 37](https://gmo-research.ai/en/quality-management/esomar37); Kantar [Philippines](https://www.kantar.com/locations/philippines), [LifePoints panel material](https://www.kantar.com/campaigns/pf/lifepoints-poll-competition), [Marketplace terms](https://www.kantar.com/marketplace/Terms-and-Use).
