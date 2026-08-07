# Philippine official election outcome acquisition

**Research date:** 2026-08-07

**Allowed sources:** Commission on Elections (COMELEC) and Philippine Statistics Authority (PSA) only

**Unit of interest:** aggregate administrative election data; zero survey respondents
**Elections:** 2010, 2013, 2016, 2019, 2022, 2025 national and local elections (NLE)

## Executive decision

1. **A source-faithful national registered-voter/turnout seed can ship now for six election cycles, 2010–2025.** Use the official COMELEC ERSD comparative report for 2010–2022 and the official 2025 local-AES turnout workbook for 2025. It needs no survey respondents and no subjective party or ideology mapping.
2. **The seed must preserve scope, source, and release metadata per row.** The 2022 comparative figure explicitly adds local absentee voting (LAV) and 63 BARMM barangays; the selected 2025 row is local AES and reports overseas voting and LAV separately. The six figures are valid as published COMELEC headline measures, but are not a perfectly constant-population series.
3. **A five-cycle regional turnout panel is possible but requires geography harmonization.** PSA OpenSTAT supplies COMELEC-sourced region data for 2013/2016/2019/2022; COMELEC supplies 2025 region/municipality data. The Negros Island Region and ARMM/BARMM changes prevent blind row concatenation.
4. **No verified public official source presently supports a multi-cycle candidate-vote-by-geography model.** Public availability changes radically by cycle: PDFs in 2010, restricted transparency-server access in 2013, missing result pages in 2016, final national canvass PDFs in 2019, 2022 metadata with currently forbidden result payloads, and precinct JSON in 2025.
5. **2025 outcome files do exist, with an important qualification.** COMELEC hosts machine-readable precinct election-return (ER) and certificate-of-canvass (COC) JSON on its official 2025 results domain. Those files are a transparency/transmission corpus “as received,” not a signed, proclamation-grade final result release. The dashboard is incomplete: 92,588 of 93,387 local ERs and 1,638 of 1,643 city/municipal COCs received. No public downloadable signed final 2025 bulk outcome file or checksum manifest was located on COMELEC as of the research date.
6. **Temporally honest evaluation is possible for turnout, not yet for geographic candidate vote share.** A defensible sequence is train 2010/2013/2016, validate 2019, test 2022, and keep 2025 sealed as an out-of-time audit. Six national observations are far too few for a stand-alone production ML model; use them as a target series, benchmark, calibration constraint, or backtest audit. Region rows add cross-sectional observations but not independent election cycles.

## Evidence labels

- **OBSERVED** — directly retrieved from an official COMELEC or PSA page/file/API during this audit.
- **INFERRED** — conclusion from observed official artifacts; not an agency assertion.
- **UNKNOWN** — not established from public official artifacts inspected.
- **DECISION** — recommended acquisition or modeling treatment.

## Production-usable target: national registered voters and turnout

### Official source files

- COMELEC ERSD, [Comparative Statistics on Registered Voters, Voters Who Actually Voted and Turnout, 1992–2022](https://www.comelec.gov.ph/php-tpls-attachments/2022NLE/Statistics/Comperative_Stats_1992_2002_NLE.pdf). The filename contains the agency typo `Comperative_Stats_1992_2002_NLE.pdf`, but the document itself covers 1992–2022.
- COMELEC ERSD, [2025 registered voters, actual voters, and turnout by city/municipality, including overseas voting](https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/2025_NLE_VotersTurnoutbyCityMun_OFOV_112525.xlsx).
- Human-facing index: [COMELEC 2025 NLE Statistics](https://www.comelec.gov.ph/?r=2025NLE%2FStatistics).

### Source-faithful normalized seed

| election_year | registered_voters | voters_who_actually_voted | published_turnout_pct | source scope and caveat |
|---:|---:|---:|---:|---|
| 2010 | 50,977,118 | 38,179,475 | 74.90 | COMELEC ERSD comparative headline; inclusion details are not stated in the two-page report |
| 2013 | 52,014,648 | 40,214,324 | 77.31 | COMELEC ERSD comparative headline |
| 2016 | 54,363,844 | 44,549,848 | 81.95 | COMELEC ERSD comparative headline; independently matches the official provincial CSV totals |
| 2019 | 61,843,771 | 46,937,139 | 75.90 | COMELEC ERSD comparative headline; matches the official city/municipality turnout report |
| 2022 | 65,831,806 | 55,431,939 | 84.20 | COMELEC ERSD comparative headline; report note says 2022 includes LAV and 63 BARMM barangays |
| 2025 | 68,431,965 | 57,070,411 | 83.3973 | COMELEC 2025 workbook, `SUMMARY` sheet, local AES row; overseas voting and LAV are separate rows |

The 2025 workbook also publishes a broader `GRAND TOTAL`: 69,673,653 registered, 57,350,968 voted, 82.3137%, composed of local AES, overseas voting, and 52,067 LAV votes. Do not substitute this total into the table above without changing `scope_code` and documenting the denominator change.

**DECISION — lawful shipping:** yes, as a COMELEC-derived aggregate seed. The [COMELEC website footer](https://www.comelec.gov.ph/?r=home) states that its content is in the public domain unless otherwise stated. Preserve the source links, retrieval date, raw hashes, agency attribution, and a non-endorsement/no-warranty note. No personal data or respondent records are present. Do not label a transformed seed “official”; label it “derived from official COMELEC aggregates.” No separate public API terms or service-level guarantee was located for the 2022/2025 transparency JSON; public-domain content status does not make those endpoints immutable or guaranteed available.

**DECISION — statistical use:** ship the rows, but do not claim that six election cycles alone train a reliable production predictor. Use pre-election registered-voter counts as eligible predictors only when their publication timestamp precedes the prediction cutoff. Actual-voter counts, turnout, ERs, COCs, and candidate totals from the election being predicted are outcomes/labels and would be target leakage if used as contemporaneous predictors.

### Recommended normalized schema

```text
election_date                 date
election_year                 int
election_type                 string       # NLE
geography_level               enum         # national, region, province, city_municipality, barangay, precinct
geography_source_code         string|null  # retain leading zeroes and source-era code
geography_name                string
registered_voters             int64
voters_who_actually_voted     int64
turnout_pct_published         decimal|null
turnout_pct_recomputed        decimal
scope_code                    string       # e.g. COMELEC_HEADLINE, LOCAL_AES, OVERSEAS, LAV, GRAND_TOTAL
includes_overseas             boolean|null
includes_lav                  boolean|null
includes_special_geographies  string|null
source_agency                 string
source_url                    string
source_artifact_status        enum         # final_statistics, final_canvass, transmission_as_received, unknown
source_release_or_update_date  date|null
retrieved_at_utc              timestamp
http_last_modified            timestamp|null
http_etag                     string|null
raw_sha256                    char(64)
parser_version                string
normalization_notes           string|null
```

Required invariant: `turnout_pct_recomputed = 100 * voters_who_actually_voted / registered_voters`. Retain the published percentage separately because agency reports round at different precision.

## Availability matrix

| Election | Registered voters / turnout | Candidate or contest votes | Best machine form located | Finality established from inspected artifact | Exact blocker |
|---|---|---|---|---|---|
| 2010 | National comparative PDF; election page totals | National presidential/vice-presidential and senatorial PDFs; city/municipality PDFs | PDF only | Senate page/report is incomplete at 272/274 COCs; NBOC Resolution 10-003 proclaims only the first nine senators pending remaining COCs | No official bulk CSV/API; municipal files are one-PDF-per-area; later complete Senate machine release not located; President/VP final canvass is constitutionally by Congress, outside the allowed source set |
| 2013 | PSA OpenSTAT region table, source COMELEC | National Senate winner table and NBOC resolutions | API CSV/JSON-stat for turnout; HTML/PDF for outcomes | NBOC proclamation/ranking resolutions available | Public bulk geographic candidate returns not located; Resolution 9677 describes credentialed, election-time transparency access, not a reusable public download |
| 2016 | Official provincial CSV; voter-profile XLSX; PSA API | National Senate canvass report and NBOC resolution | CSV/XLSX for turnout/profile; PDF/HTML for outcome | NBOC Resolution 007-16 proclaims winners and says 1,211 remaining votes could not alter ranking | COMELEC election-results route currently returns Page Not Found; no official public bulk geographic candidate-vote file located |
| 2019 | Official city/municipality turnout HTML/PDF; PSA API | Final national Senate and party-list canvass reports | API CSV/JSON-stat for turnout; HTML/PDF for outcome | COMELEC labels the canvass reports final | No current official bulk geographic candidate-vote endpoint located; likely historical results hostname does not resolve now |
| 2022 | Official city/municipality turnout HTML/PDF; PSA API; results dashboard metadata | Final national Senate/party-list canvass PDFs; result host defines contest metadata | JSON metadata plus API CSV/JSON-stat; result payloads currently inaccessible | Signed final national Senate/party-list canvass reports exist; transmission dashboard is incomplete | `/data/results/...` and `/data/totalized_results/...` returned HTTP 403; dashboard reports less than full receipt; TMS accreditation window is closed |
| 2025 | Final registered-voter and turnout XLSX/PDF by region and municipality | Precinct ER JSON and COC JSON on official results host | XLSX plus JSON | Statistics page labels registered-voter data final; result JSON is only “as received” transmission data | 799 local ERs, five city/municipal COCs, eight overseas COCs, and one regional COC were not received on the observed dashboard; no signed final bulk result/proclamation package located |

## Exact source inventory by election

### 2025 NLE

#### Registration and turnout

Official index: [COMELEC 2025 NLE Statistics](https://www.comelec.gov.ph/?r=2025NLE%2FStatistics), updated 2025-11-25 and sourced to the Election Records and Statistics Department/Division (ERSD).

Direct downloads:

- [Registered voters, actual voters, and turnout by sex/age, region, and municipality — XLSX](https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/2025_NLE_RVVAV_BY_SEX_AGE_112525.xlsx)
- [Registered voters, actual voters, and turnout by city/municipality plus overseas voting — XLSX](https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/2025_NLE_VotersTurnoutbyCityMun_OFOV_112525.xlsx)
- [Final registered voters — XLSX](https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/CONSOLIDATED_2025_Number_Of_Registered_Voters.xlsx)
- [Registered voters by age and sex — XLSX](https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/02072025_DataNumRegVote_AgeSex.xlsx)
- [Candidates by sex — XLSX](https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/03252025_NLE_NUMBER_OF_CANDIDATES_BY_SEX_2-7-25.xlsx)

Observed workbook schemas:

- `2025_NLE_RVVAV_BY_SEX_AGE_112525.xlsx`
  - `Summary`: age bracket; registered both/male/female; actually voted both/male/female; turnout both/male/female.
  - `REGION`: region plus registered, voted, and turnout split by sex and age groups 18–30, 31–59, and 60+.
  - `MUN`: region, province, city/municipality, district plus the same sex/age measures.
- `2025_NLE_VotersTurnoutbyCityMun_OFOV_112525.xlsx`
  - Sheets: `SUMMARY`, `regional_summary`, `provl_summary`, `mun_coc`, `OVERSEAS VOTING`.
  - Core fields: geography/group, clustered precincts, registered voters, voters who actually voted, turnout.
- `CONSOLIDATED_2025_Number_Of_Registered_Voters.xlsx`
  - `NLE`/`BARMM-PE`: geography, established precincts, clustered precincts, registered voters, voting centers.
  - `Total ROVs`: post, country, land-based, seafarer, total overseas registered voters.

Observed consistency warnings:

- The final registered-voter workbook and turnout workbook use 93,287 local clustered precincts, while the 2025 transparency dashboard expects 93,387 local ERs: difference 100. These may be different operational units, a correction, or an error; the public artifacts inspected do not explain the difference.
- The registered-voter workbook reports 1,241,690 overseas registered voters; the turnout workbook reports 1,241,688: difference two.
- The `CONSOLIDATED_2025_Number_Of_Registered_Voters.xlsx` URL reported a 2026-07-28 `Last-Modified` value during this audit. A filename and stable-looking URL are therefore not evidence of immutable content.

#### Official-domain result JSON

Root: [2025 COMELEC Election Results](https://2025electionresults.comelec.gov.ph/)

Exact endpoints and templates:

```text
GET https://2025electionresults.comelec.gov.ph/data/common/dashboard.json
GET https://2025electionresults.comelec.gov.ph/data/regions/local/0.json
GET https://2025electionresults.comelec.gov.ph/data/regions/local/{geography_code}.json
GET https://2025electionresults.comelec.gov.ph/data/regions/overseas/0.json
GET https://2025electionresults.comelec.gov.ph/data/regions/precinct/{first_2_digits_of_barangay_code}/{barangay_code}.json
GET https://2025electionresults.comelec.gov.ph/data/er/{first_3_digits_of_precinct_id}/{precinct_id}.json
GET https://2025electionresults.comelec.gov.ph/data/coc/{region_code}.json
```

Verified examples:

- [Dashboard](https://2025electionresults.comelec.gov.ph/data/common/dashboard.json)
- [Local geography root](https://2025electionresults.comelec.gov.ph/data/regions/local/0.json)
- [Ilocos Norte child geography](https://2025electionresults.comelec.gov.ph/data/regions/local/R001000.json)
- [Municipal children under code 2800000](https://2025electionresults.comelec.gov.ph/data/regions/local/2800000.json)
- [Barangay children under code 2801000](https://2025electionresults.comelec.gov.ph/data/regions/local/2801000.json)
- [Precinct list for barangay 2801001](https://2025electionresults.comelec.gov.ph/data/regions/precinct/28/2801001.json)
- [Sample precinct ER 28010001](https://2025electionresults.comelec.gov.ph/data/er/280/28010001.json)
- [National COC 0](https://2025electionresults.comelec.gov.ph/data/coc/0.json)

Schemas:

```text
region index:
  { regions: [{ categoryCode, masterCode, code, name }] }

precinct ER:
  {
    totalErReceived,
    information: {
      machineId, location, votingCenter, precinctId, precinctInCluster,
      abstentions, numberOfRegisteredVoters, numberOfActuallyVoters,
      numberOfValidBallot, turnout
    },
    national: [{
      contestCode, contestName,
      statistic: { overVotes, underVotes, validVotes, obtainedVotes },
      candidates: { candidates: [{ name, votes, percentage }] }
    }],
    local: [same contest shape]
  }

COC:
  {
    totalCocReceived,
    national: [{
      contestCode, contestName,
      statistic: { overVotes, underVotes, validVotes, obtainedVotes },
      candidates: { candidates: [{ name, votes, percentage }] }
    }]
  }
```

The site’s own notice says results are ERs/COCs as electronically transmitted and automatically updated as received, and that official canvassed Board of Canvassers results—not this presentation—are the basis for proclamation. Technical contact published by the site: `2025nle.results@comelec.gov.ph`.

Observed dashboard completeness:

| stream | expected | received | reported percentage |
|---|---:|---:|---:|
| Local ER | 93,387 | 92,588 | 99.14 |
| Overseas ER | 242 | 234 | 96.69 |
| National COC | 1 | 1 | 100.00 |
| Regional COC | 1 | 0 | 0.00 |
| Provincial COC | 84 | 84 | 100.00 |
| City/municipal COC | 1,643 | 1,638 | 99.70 |
| Overseas COC | 64 | 64 | 100.00 |

**2025 finality answer:** official-domain machine-readable outcome files exist. A public proclamation-grade bulk file does not appear in the inspected COMELEC 2025 result/statistics pages or official-site searches. The JSON has no signed status field, embedded source hash, or release manifest. Treat it as `transmission_as_received`; request signed NBOC/BOC canvass reports, SOVs, COCs, and proclamation records for final labels.

The official procurement [Annex K report examples](https://www.comelec.gov.ph/php-tpls-attachments/Procurement/ProcurementProjects/12152023_SBAC012023FASTrAC2ndBidding/12152023_SBAC012023FASTrAC2ndBiddingITBBidDocsAnnexK.pdf) show the stronger form a final/reproducible artifact should take: expected/reported COCs, registered/voted counts, turnout, ballot statistics, candidate votes, report/system hashes, signatures or digital signatures, and system version/hash. This is a template/specification, not a 2025 result.

### 2022 NLE

#### Final national canvass

- Index: [COMELEC 2022 Election Results](https://www.comelec.gov.ph/?r=2022NLE%2FElectionResults_)
- [Senatorial Summary Statement of Votes — signed PDF](https://www.comelec.gov.ph/php-tpls-attachments/2022NLE/ElectionResults/2022NLE_SenatorialSummaryStatementofVotes.pdf)
- [Senatorial report page](https://www.comelec.gov.ph/?r=2022NLE%2FElectionResults_%2FSenatorialSummaryStatementofVotes)
- [Party-list report page](https://www.comelec.gov.ph/?r=2022NLE%2FElectionResults_%2FPartyListSummaryStatementofVotes)
- [Party-list Summary Statement of Votes — signed PDF](https://www.comelec.gov.ph/php-tpls-attachments/2022NLE/ElectionResults/2022NLE_PartyListSummaryStatementofVotes.pdf)

The signed Senate PDF contains candidate, party, grand total, AES, manual overseas voting, LAV, PDL, and 63 BARMM-barangay columns. Despite some page titles saying “by Region,” these are voting modalities/special groups, not a geographic regional vote table. COMELEC labels these reports final.

#### Turnout

- [COMELEC 2022 Statistics](https://www.comelec.gov.ph/?r=2022NLE%2FStatistics)
- [Registered voters, actual voters, and turnout by city/municipality — page](https://www.comelec.gov.ph/?r=2022NLE%2FStatistics%2F2022RVVAVmcocfinal)
- [Registered voters, actual voters, and turnout by city/municipality — PDF](https://www.comelec.gov.ph/php-tpls-attachments/2022NLE/Statistics/2022RVVAVmcocfinal.pdf)
- [Comparative 1992–2022 report](https://www.comelec.gov.ph/php-tpls-attachments/2022NLE/Statistics/Comperative_Stats_1992_2002_NLE.pdf)
- [Overseas registered voters by sex/post — PDF](https://www.comelec.gov.ph/php-tpls-attachments/OverseasVoting/Statistics/2022NLEOVRegVoters.pdf)

The city/municipality report has geography, established precincts, clustered precincts, registered voters, voters who actually voted, and turnout. Its national MCOC total is 65,745,526 registered and 55,290,821 voted (84.10%). The comparative report instead gives 65,831,806 and 55,431,939 (84.20%) and explicitly says 2022 includes LAV and 63 BARMM barangays. Keep them as separate scopes.

#### Transparency host

Root: [2022 COMELEC Election Results](https://2022electionresults.comelec.gov.ph/)

Accessible metadata:

```text
GET https://2022electionresults.comelec.gov.ph/data/dashboard/statistics.json
GET https://2022electionresults.comelec.gov.ph/data/config.json
GET https://2022electionresults.comelec.gov.ph/data/last-update.json
GET https://2022electionresults.comelec.gov.ph/data/regions/root.json
GET https://2022electionresults.comelec.gov.ph/data/regions/{url}.json
GET https://2022electionresults.comelec.gov.ph/data/contests/{contest_code}.json
GET https://2022electionresults.comelec.gov.ph/data/regions/static_precincts_{first_4_digits_of_precinct_id}.json
```

Verified examples:

- [Receipt statistics](https://2022electionresults.comelec.gov.ph/data/dashboard/statistics.json)
- [Root geography/contest metadata](https://2022electionresults.comelec.gov.ph/data/regions/root.json)
- [Senate contest 5589](https://2022electionresults.comelec.gov.ph/data/contests/5589.json)
- [Site status and finality notice](https://2022electionresults.comelec.gov.ph/scripts/app/siteMap/siteMap.html)

Compressed metadata keys include `rc`, `rcc`, `rn`, `can`, `cll`, `cl`, `url`, `srs`, `tcs`, `cs`, `pps`, `total-vb`, and `total-voters`. Contest metadata uses `cc`, `cn`, `ccc`, `ccn`, `pre`, `type`, `bos`; candidate entries include `boc`, `bon`, `boi`, `to`, `pc`, `pn`, `pcc`, `pcy`, `pcm`, `pck`. Preserve the raw JSON and build an explicit data dictionary before renaming these fields.

Blocked result paths discovered from the official application:

```text
GET https://2022electionresults.comelec.gov.ph/data/results/{region_url}.json
GET https://2022electionresults.comelec.gov.ph/data/totalized_results/{region_url}.json
```

Examples `/data/results/217/217233.json`, `/data/results/217/217234.json`, and `/data/totalized_results/217/217233.json` returned HTTP 403 during this audit, including ordinary browser-origin headers. Do not bypass the access control.

Receipt statistics are not final: 106,026 of 107,785 all ERs (98.36%), 83/83 provincial COCs, and 1,658/1,659 municipal/city COCs. The site notice says results are received transmissions, not proclamation records.

Historical transparency access was limited. [COMELEC Resolution 10781](https://www.comelec.gov.ph/?r=2022NLE%2FResolutions%2Fres10781) and its [signed PDF](https://www.comelec.gov.ph/php-tpls-attachments/2022NLE/Resolutions/com_res_10781.pdf) required accreditation and nomination for media/citizen-arm/information-partner access before the 2022 deadline. That procedure is closed and is not a present public bulk-download route.

### 2019 NLE

- [COMELEC 2019 Election Results](https://www.comelec.gov.ph/?r=2019NLE%2FElectionResults_)
- [Final Senatorial Summary Statement of Votes — page](https://www.comelec.gov.ph/?r=2019NLE%2FElectionResults_%2FSenatorialSummaryStatementofVotes)
- [Final Senatorial Summary Statement of Votes — signed ranked PDF](https://www.comelec.gov.ph/php-tpls-attachments/2019NLE/ElectionResults/2019NLE_SenatorialSummaryStatementOfVotes_ByRank.pdf)
- [Final Party-list Canvass Report — page](https://www.comelec.gov.ph/?r=2019NLE%2FElectionResults_%2FPartyListCanvassReport)
- [COMELEC 2019 Statistics](https://www.comelec.gov.ph/?r=2019NLE%2FStatistics)
- [Registered voters, actual voters, and turnout by city/municipality — page](https://www.comelec.gov.ph/?r=2019NLE%2FStatistics%2F2019RVVAVmcocfinal)
- [Registered voters, actual voters, and turnout by city/municipality — PDF](https://www.comelec.gov.ph/php-tpls-attachments/2019NLE/Statistics/2019_RVVAV_mcoc_final.pdf)
- [Registered voters by sex/province — PDF](https://www.comelec.gov.ph/php-tpls-attachments/2019NLE/Statistics/NumofRegVoterbySexbyProv.pdf)

The final Senate report supplies national candidate totals split by AES, manual overseas voting, LAV, and PDL—not geographic candidate totals. The turnout report supplies region/province/city/municipality/district, established and clustered precincts, registered voters, actual voters, and turnout. National turnout is 61,843,771 registered and 46,937,139 voted (75.90%).

No current official bulk geographic candidate-vote endpoint was located. `2019electionresults.comelec.gov.ph` did not resolve during this audit; this is a current availability observation, not proof that no historical transparency site ever existed.

### 2016 NLE

- [COMELEC 2016 NLE index](https://www.comelec.gov.ph/?r=2016NLE)
- [COMELEC 2016 Statistics](https://www.comelec.gov.ph/?r=2016NLE%2FStatistics)
- [Final provincial registered-voter/actual-voter/turnout CSV](https://www.comelec.gov.ph/php-tpls-attachments/2016NLE/Statistics/2016NLE_rvvav_Final_pcoc_csvformat.csv)
- [Overseas registered voters CSV](https://www.comelec.gov.ph/php-tpls-attachments/OverseasVoting/Statistics/2016Statistics/2016_Final_Stat_of_OV_Voters.csv)
- [Voter profile by age group — XLSX](https://www.comelec.gov.ph/php-tpls-attachments/2016NLE/Statistics/Philippine2016VotersProfile/Philippine_2016_Voter_Profile_by_Age_Group.xlsx)
- [Voter profile by province/city/municipality/district — XLSX](https://www.comelec.gov.ph/php-tpls-attachments/2016NLE/Statistics/Philippine2016VotersProfile/Philippine_2016_Voter_Profile_by_Provinces_and_Cities_or_Municipalities_including_Districts.xlsx)
- [NBOC index](https://www.comelec.gov.ph/?r=2016NLE%2FNBOC)
- [NBOC Resolution 007-16 — Senate proclamation page](https://www.comelec.gov.ph/?r=2016NLE%2FResolutions%2Fnboc_res00716)
- [National Senate canvass report by rank — PDF](https://www.comelec.gov.ph/php-tpls-attachments/2016NLE/Resolutions/Senatorial_National_Canvass_Report_byRank.pdf)

CSV schema:

```text
REGION
PROVINCE
NUM_OF_CLUSTERED_PREC_FUNCTIONED
REG_VOTERS
VOTERS_WHO_ACTUALLY_VOTED
VOTER_TURNOUT
```

The 82 province/region rows sum to 54,363,844 registered and 44,549,848 voted. The NBOC resolution establishes the winning Senate result and says 1,211 remaining votes could not change the ranking. The public `2016NLE/ElectionResults_` route currently returns Page Not Found, and no official bulk geographic candidate-vote file was located.

### 2013 NLE

- [COMELEC 2013 NLE index](https://www.comelec.gov.ph/?r=2013NLE)
- [Senatorial results table](https://www.comelec.gov.ph/?r=Results%2F2013NLE%2FSenatorial)
- [Party-list results table](https://www.comelec.gov.ph/?r=Results%2F2013NLE%2FPartylist)
- [2013 NLE resolution archive](https://www.comelec.gov.ph/?r=References%2FComelecResolutions%2FNLE%2F2013NLE)
- [NBOC Resolution 0010-13 — Senate ranking](https://www.comelec.gov.ph/?r=References%2FComelecResolutions%2FNLE%2F2013NLE%2Fnbocres001013)
- [Resolution 9677 — transparency/media server access page](https://www.comelec.gov.ph/?r=References%2FComelecResolutions%2FNLE%2F2013NLE%2Fres9677)
- [Resolution 9677 — signed PDF](https://www.comelec.gov.ph/php-tpls-attachments/References/ComelecResolutions/NLE/2013NLE/com_res_9677.pdf)

The results tables and NBOC resolutions establish national outcomes. Resolution 9677 is evidence of the historical acquisition boundary: approved transparency/media-server end users used a COMELEC workstation and USB transfer, with no direct Internet/LAN connection. The application and provisioning deadlines were in 2013. This is not an open API and cannot be used retroactively.

The machine-readable turnout source for 2013 is PSA OpenSTAT’s COMELEC-sourced regional table described below. No public official bulk geographic candidate-return file was located.

### 2010 NLE

- [COMELEC 2010 NLE results index](https://www.comelec.gov.ph/?r=Results%2F2010NLE)
- [President/vice-president results page](https://www.comelec.gov.ph/?r=Results%2F2010NLE%2FPresVP)
- [President/vice-president results PDF](https://www.comelec.gov.ph/php-tpls-attachments/References/Results/2010NLE/Results_Pres_VPres_2010_Elections.pdf)
- [Senatorial results page](https://www.comelec.gov.ph/?r=Results%2F2010NLE%2FSenatorial)
- [Senatorial ranked results PDF](https://www.comelec.gov.ph/php-tpls-attachments/References/Results/2010NLE/Senatorial_ranked.pdf)
- [City/municipality result index](https://www.comelec.gov.ph/?r=Results%2F2010NLE%2FCityMun)
- [Example city result: Manila First District PDF](https://www.comelec.gov.ph/php-tpls-attachments/References/Results/2010NLE/citymun/ncr/ncr_1st_district_manila.pdf)
- [NBOC Resolution 10-003 — first nine senators](https://www.comelec.gov.ph/?r=References%2FComelecResolutions%2FNLE%2F2010NLE%2Fnbcres10003)

National result PDFs expose candidate and modality/COC totals. The city/municipality index exposes many separate PDFs, not a bulk manifest or API. The Senate page reports 272 received COCs out of 274; Resolution 10-003 expressly proclaims only the first nine senators and says ranks 10–12 would be proclaimed after remaining COCs. A later complete machine-readable Senate release was not located in the inspected official archive.

The President/vice-president page is useful outcome evidence but not sufficient, within this source restriction, to establish proclamation-grade finality: Congress, not COMELEC, canvasses and proclaims President and Vice-President. Congressional sources were intentionally excluded.

The strongest six-cycle turnout source is the later COMELEC ERSD comparative report, which gives 2010 national registered voters, actual voters, and turnout in a single series with 2013–2022.

## PSA machine-readable access

### OpenSTAT regional election table

- UI: [Number of Clustered Precincts, Registered Voters, Voters Who Actually Voted and Voters' Turnout by Region, Voters and Year](https://openstat.psa.gov.ph/PXWeb/pxweb/en/DB/DB__3S__C15/0191J2BNCP0.px/)
- Metadata and data API endpoint: `https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/3S/C15/0191J2BNCP0.px`
- [OpenSTAT API documentation](https://openstat.psa.gov.ph/API-Documentation)

`GET` returns metadata. Observed dimensions:

- `Region`: Philippines plus NCR, CAR, Regions I–XIII, and BARMM; values `0`–`17`.
- `Voters`: clustered precincts, registered voters, voters who actually voted, turnout; values `0`–`3`.
- `Year`: 2013, 2016, 2019, 2022; values `0`–`3`.
- Metadata `source`: `Commission on Elections`.

Exact all-cells POST shape:

```json
{
  "query": [
    {
      "code": "Region",
      "selection": {
        "filter": "item",
        "values": ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17"]
      }
    },
    {
      "code": "Voters",
      "selection": {
        "filter": "item",
        "values": ["0", "1", "2", "3"]
      }
    },
    {
      "code": "Year",
      "selection": {
        "filter": "item",
        "values": ["0", "1", "2", "3"]
      }
    }
  ],
  "response": { "format": "csv" }
}
```

The observed response was `text/csv; charset=Windows-1252`; decode accordingly. CSV or legacy `json-stat` is safer than `json-stat2` here: a test `json-stat2` response advertised an 18×4×4 cube but returned only one value, so ingestion must assert exactly 288 cells and fail closed.

Related official table:

- `https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/3S/C15/0181J2BSEP0.px` — seats, candidates, and elected candidates by position for 2013/2016/2019/2022. It contains counts, not candidate identities or votes.

PSA also publishes the Philippine Statistical Yearbook table as [2022 Table 15.18 CSV](https://psa.gov.ph/system/files/psy/2022_T15_18.csv) and [XLSX](https://psa.gov.ph/system/files/psy/2022_T15_18.xlsx). The links were visible in the official browser page, but direct non-browser requests were blocked by PSA’s web application firewall during this audit. Prefer OpenSTAT for automated acquisition.

### Terms

[PSA OpenSTAT Terms of Use](https://openstat.psa.gov.ph/Terms) apply Creative Commons Attribution 4.0 International (CC BY 4.0) to OpenSTAT tables, datasets, and documentation. Reuse and adaptation are allowed with attribution, a link to the terms/license, change indication, and preservation of technical notes. PSA provides the data as-is and disclaims accuracy/completeness warranties and liability.

Do not substitute PSA Public Use File/microdata conditions for the OpenSTAT aggregate-table terms. If rows mix COMELEC public-domain artifacts and PSA CC BY 4.0 artifacts, retain a per-row `license_basis` and satisfy CC BY 4.0 for the PSA-derived rows.

## Finality hierarchy

Use this order when assigning model labels:

1. Signed/digitally signed NBOC or relevant Board of Canvassers canvass report, SOV, COC, and proclamation record.
2. COMELEC page explicitly labeled final and linked to a signed canvass artifact.
3. Final ERSD statistical report for turnout/registration—not a substitute for candidate-result proclamation.
4. Transmission/transparency ER or COC “as received.” Useful for audit/research; not a final-label source unless reconciled to signed canvass/proclamation records.
5. Dashboard, unofficial tally, screenshot, or third-party mirror. Never a final label.

COMELEC is the National Board of Canvassers for Senators and party-list representatives. Congress canvasses President and Vice-President. A COMELEC presidential table alone therefore cannot establish the highest legal finality for those offices under the user’s COMELEC/PSA-only source restriction.

## Temporally honest split assessment

### National turnout target — usable with strong limits

Recommended split:

```text
train:      2010, 2013, 2016
validation: 2019
test:       2022
sealed OOT: 2025
```

Rules:

- Freeze raw source bytes and parser before opening 2022; freeze model/hyperparameters before opening 2025.
- Use actual turnout only as the label for that election.
- Permit only features available before the declared forecast cutoff.
- Record source-scope drift. Either model `scope_code`, publish sensitivity bounds, or obtain harmonized official counts from COMELEC.
- Report error by election, not only pooled row error.
- Do not interpret a six-cycle national fit as scientific validation or production capacity evidence.

### Regional turnout target — potentially useful, still small

PSA OpenSTAT supplies 2013–2022; COMELEC’s 2025 workbook supplies the fifth cycle. Possible split:

```text
train:      2013, 2016, 2019
validation: 2022
test:       2025
```

Required first:

- Preserve election-era geography codes/names.
- Reconcile ARMM/BARMM and the Negros Island Region using an explicit, versioned concordance; PSA’s official [Philippine Standard Geographic Code](https://psa.gov.ph/classification/psgc) is the permitted reference family.
- Decide whether to aggregate all cycles to invariant geography or keep vintage geographies with fixed effects. Never silently reassign historical votes to later boundaries.
- Reconcile PSA’s 2022 national value with COMELEC’s MCOC and comparative-report scopes.

This is temporally ordered but has only five election dates. Region rows within one election share national shocks and are not independent temporal replications.

### Candidate/contest vote-share by geography — not presently supported

No honest multi-cycle train/validation/test panel can be assembled solely from the currently verified public official bulk files:

- 2025: precinct ER/COC JSON exists but is incomplete transmission data.
- 2022: metadata exists; result payloads return 403; receipt was incomplete.
- 2019: signed final national canvass only; no located bulk geographic vote payload.
- 2016: signed national report; old election-results route missing.
- 2013: national tables/resolutions; transparency acquisition was restricted and time-bound.
- 2010: national and one-PDF-per-city/municipality reports; national Senate page is 272/274 COCs.

If COMELEC supplies standardized final SOV/COC data, a broad Senate split could be train 2010/2013/2016, validate 2019, test 2022, sealed audit 2025. A midterm-only sequence—2013 train, 2019 validation, 2025 test—has only three elections and is statistically inadequate. Presidential elections 2010/2016/2022 also provide only three cycles and require Congressional finality evidence for President/Vice-President.

## Official request procedures and exact ask

### COMELEC

[COMELEC Citizen’s Charter — voters/general public](https://www.comelec.gov.ph/?r=AboutCOMELEC%2FCitizensCharter%2FFrontlineServices%2FVotersGeneralPublic) covers ERs, COCs, SOVs by precinct/city/municipality/summary, proclamations, registered-voter/actual-voter reports, and statistical data.

Observed procedure:

1. Submit an approved letter of request addressed to the Executive Director, identifying every document/data/report/certification requested, at the Office of the Executive Director, 7/F Palacio del Gobernador.
2. Present the approved request to ERSD, G/F Annex Building.
3. Obtain an Order of Payment and pay the Cash Division.
4. Present the official receipt to ERSD.
5. ERSD records the request and gives the release schedule.
6. Sign the logbook and receive the release personally or through an authorized representative.

Published service hours: 08:00–17:00, Monday–Friday. Published fees: PHP 75 certification; PHP 100 for the first ten pages plus PHP 2 per succeeding page; photocopy PHP 2/page; disk copy PHP 0.50/page; CD PHP 15. The Charter gives nominal counter-processing times but not a guaranteed bulk-data fulfillment date.

Request this exact package for each of 2010/2013/2016/2019/2022/2025:

```text
- Final registered voters and voters who actually voted by:
  region, province, city/municipality, district, barangay, clustered precinct.
- Election-specific geography identifiers plus PSGC where maintained.
- Every national and local contest, contest code/name, candidate code/name,
  ballot order, party as officially recorded, and votes by the same geographies.
- ER, COC, SOV, canvass report, and proclamation status/identifier.
- Expected-versus-received ER/COC counts and the exact missing geography/precinct IDs.
- Overvotes, undervotes, valid votes/ballots, ballots cast, abstentions where recorded.
- Local AES, overseas, LAV, PDL, BARMM/special-area scope flags.
- Native CSV, XLSX, or JSON plus data dictionary; avoid PDF-only delivery.
- Release/version date, correction/errata history, parser/schema version.
- Agency-generated SHA-256 manifest or digitally signed manifest for every file.
- Signed/digitally signed final canvass and proclamation artifacts.
- Written reuse/public-domain status and required attribution, if any.
```

Ask ERSD to reconcile explicitly:

- 2025 dashboard 93,387 expected local ERs versus statistics workbook 93,287 clustered precincts.
- 2025 overseas registered voters 1,241,690 versus 1,241,688.
- 2022 MCOC turnout versus comparative-statistics turnout, including LAV and 63 BARMM barangays.
- Whether 2025 national/region/province/city COC JSON has a frozen final release, and where signed NBOC canvass/proclamation files and checksums are published.

The result-site technical emails (`2025nle.results@comelec.gov.ph`, `2022nle.results@comelec.gov.ph`) are appropriate for endpoint/schema defects, but the Executive Director/ERSD Citizen’s Charter route is the official data-record request path.

### PSA

- [How to acquire data from PSA](https://psa.gov.ph/how-acquire-data-psa)
- [PSA online data request form](https://psa.gov.ph/data-request-form)
- [PSA 2025 Citizen’s Charter — Censuses and Technical Coordination Office external services](https://psa.gov.ph/system/files/citizens-charter/4-PSA-2025-Citizens-Charter-Censuses-and-Technical-Coordination-Office-External-Services.pdf)

PSA accepts its online request form, eFOI, in-person library requests, and official letters. The data-request page says PSA sends an initial response or clarification within three working days; completion depends on availability. The Citizen’s Charter describes an eFOI process of up to 15 working days, with a possible 20-working-day extension.

For the OpenSTAT election table, request only PSA-held metadata/corrections or a stable export. Candidate-level geographic records are COMELEC-origin election records and should be requested from COMELEC first.

## Reproducibility and checksum strategy

No agency-published checksum manifest was found for the inspected downloads. HTTP `ETag` was absent on several attachments and weak on some JSON responses. Stable-looking URLs are not immutable versions. Required local strategy:

1. Download raw bytes without spreadsheet/PDF conversion.
2. Record canonical URL, redirect-final URL, UTC retrieval time, HTTP status, `Content-Type`, byte length, `Last-Modified`, and `ETag`.
3. Compute SHA-256 on raw bytes before parsing.
4. Save exact PSA API POST body and response bytes. Decode its CSV as Windows-1252.
5. Decode COMELEC JSON explicitly as UTF-8; the response content type may omit a charset. Fail if mojibake appears in candidate names.
6. Retain originals in immutable/versioned object storage. Never overwrite a prior hash when the same URL changes.
7. For XLSX, record workbook hash and sheet names; optionally hash each unzipped OOXML part as secondary evidence. Preserve formulas and cached values.
8. For PDFs, retain the signed original; treat extracted text/OCR as a derivative with parser/version/page-count metadata.
9. Validate before normalization: nonnegative integer counts; `registered >= voted`; recomputed turnout within declared rounding tolerance; geography sums versus agency national totals; contest/candidate counts; expected-versus-received ER/COC counts.
10. Quarantine mismatches. Never silently impute missing returns or call a receipt-limited transmission corpus final.

PowerShell checksum pattern after a controlled download:

```powershell
$sourceUrl = 'https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/2025_NLE_VotersTurnoutbyCityMun_OFOV_112525.xlsx'
$rawPath = 'D:\election-raw\2025_NLE_VotersTurnoutbyCityMun_OFOV_112525.xlsx'
Invoke-WebRequest -Uri $sourceUrl -OutFile $rawPath
Get-FileHash -LiteralPath $rawPath -Algorithm SHA256
```

Store `$sourceUrl`, retrieval UTC, response headers, byte length, and the emitted hash in the manifest. Use an explicit, bounded raw-data directory; never overwrite an existing differently hashed file.

Implemented turnout-source verifier: `scripts/acquire_comelec_turnout.py` uses a
pre-follow COMELEC redirect allowlist, exact `Content-Type` and streaming byte
limits, raw SHA-256 checks, source-derived count extraction, and locked
date/scope/source metadata. It retains exact originals in
`docs/data/raw/comelec-national-turnout-1992-2025`; the manifest records direct
HTTP 200 final URLs, content types, lengths, and `Last-Modified` values. The
locked artifacts currently expose no `ETag`.

Observed retrieval fingerprints on 2026-08-07:

| Official artifact | Bytes | HTTP Last-Modified | SHA-256 |
|---|---:|---|---|
| [COMELEC comparative turnout 1992–2022 PDF](https://www.comelec.gov.ph/php-tpls-attachments/2022NLE/Statistics/Comperative_Stats_1992_2002_NLE.pdf) | 139,254 | 2022-11-07 05:51:57 GMT | `c4421379e76f1cb9ff52fd6fc3d334ad262aada55b6d49360d2732685c573dce` |
| [COMELEC 2016 provincial turnout CSV](https://www.comelec.gov.ph/php-tpls-attachments/2016NLE/Statistics/2016NLE_rvvav_Final_pcoc_csvformat.csv) | 4,049 | 2016-10-17 11:21:14 GMT | `4df94fcf3f4a3c8fbaa8628c8cc3fb0b191b35e5e26e13c21de0288925ca4684` |
| [COMELEC 2025 city/municipality/overseas turnout XLSX](https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/2025_NLE_VotersTurnoutbyCityMun_OFOV_112525.xlsx) | 225,209 | 2025-12-02 06:42:52 GMT | `316647c5b417fedc2fa27a400fee4f705a48f9235cefa5127949cc58dbaa5d9d` |
| [COMELEC 2025 sex/age turnout XLSX](https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/2025_NLE_RVVAV_BY_SEX_AGE_112525.xlsx) | 806,079 | 2025-12-02 06:42:52 GMT | `cf9710f6b1e34e67e8e9b99a8186c592533c0bb784278714b7d6f9cf1e12a32f` |
| [COMELEC 2025 final registered-voter XLSX](https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/CONSOLIDATED_2025_Number_Of_Registered_Voters.xlsx) | 125,168 | 2026-07-28 10:18:43 GMT | `bd89dee3c17a8849fa693c9d6f5a0521e2514d2164d336dfd7133c496c0b0017` |
| [COMELEC 2025 dashboard JSON](https://2025electionresults.comelec.gov.ph/data/common/dashboard.json) | 540 | 2025-05-16 | `3c03d406ecdf704167fa994c23619d582eb2b3e3f9c9d8090617237a24d9087e` |
| [COMELEC 2025 local geography root JSON](https://2025electionresults.comelec.gov.ph/data/regions/local/0.json) | 1,525 | 2025-05-11 | `fab78bf55b3d102687c528253e62a9a8555d01d5479022af639fc7340d7b46ec` |
| [COMELEC 2025 sample ER JSON](https://2025electionresults.comelec.gov.ph/data/er/280/28010001.json) | 17,885 | 2025-05-16 | `5d6eb4c5296de1b1a1bd0fb1f41cc5679bfef7ed5e2d7502322f7f66c99010d7` |
| [COMELEC 2025 national COC JSON](https://2025electionresults.comelec.gov.ph/data/coc/0.json) | 14,159 | 2025-05-15 | `898ec105b6d16ede4f2cfa901cc2cae6b952468f58c001893d199f6e08bee14b` |
| [COMELEC 2022 receipt statistics JSON](https://2022electionresults.comelec.gov.ph/data/dashboard/statistics.json) | 2,730 | 2022-05-27 | `c793d16faa4a1e6681988e39fa1bcb4539bb58fa6962316f2da0b8abbf701eb7` |
| [COMELEC 2022 geography root JSON](https://2022electionresults.comelec.gov.ph/data/regions/root.json) | 2,376 | 2022-05-27 | `4e0312022d67338eda37d83499e4c373b187891cd6a9e2733e80b789d2333a7a` |
| PSA OpenSTAT all-cell CSV response for table `0191J2BNCP0.px` | 3,531 | none observed | `f225929e282e45885ec37371262c4738c5041cc2e925ebec1222d7855e7dc4a8` |

These hashes identify bytes retrieved during this audit; they are not agency signatures and may change if an agency replaces content at the same URL.

## Stable-URL assessment

- **Best current automation source:** PSA OpenSTAT API for 2013–2022 regional turnout. Stable endpoint and explicit dimensions; generated responses lack strong cache validators, so retain request+response hashes.
- **Best current 2025 source:** COMELEC XLSX statistics and official results JSON. Both are directly downloadable. Neither is an immutable versioned release; archive every retrieval.
- **2022:** official host and metadata are live, but result payloads are access-blocked and incomplete as observed.
- **2019/2016:** current main-site reports remain accessible; historical result-host availability is absent or broken.
- **2013:** national pages/resolutions remain; transparency-server access was credentialed and time-bound.
- **2010:** main-site PDF archive remains; local reports are fragmented and no bulk manifest was located.

## Rejected discovery aids

No GitHub, Hugging Face, Kaggle, media tally, election-watch, or other third-party mirror was used as evidence or as a data source. Such mirrors may help identify a filename, but must remain rejected until the bytes are matched to an official COMELEC/PSA artifact and finality is independently established from an official signed record.

## Acquisition recommendation

Ship in two stages:

1. **Now:** the six-row COMELEC national turnout seed and the 2013–2022 PSA regional panel, with 2025 region rows appended under election-era geography codes. Include source-level license, hash manifest, scopes, and all caveats above.
2. **After COMELEC fulfillment:** candidate/contest votes by geography, only after signed finality artifacts, missing-return accounting, official data dictionary, correction history, and agency checksum/signature evidence are obtained.

Do not block the turnout target on candidate-result acquisition. Do not use the 2025 transparency corpus as final labels. Do not create subjective historical party-family mappings merely to increase sample size.
