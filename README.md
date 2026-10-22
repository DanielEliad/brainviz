# BrainViz

This project is an interactive visualization of dynamic functional connectivity between 14 resting state networks (RSNs) in the ABIDE I+II autism dataset. It is a web application with a FastAPI backend that computes windowed correlation functions on the RSN activation values. The correlations include Pearson, Spearman and wavelet lead coherence correlation. The frontend is built in React and it plays the correlation matrices as an animated graph. The webapp also has an overview tab comparing all subjects and each class with one another.

This application was presented as a poster at VCBM 2026. The abstract and poster are in `papers/`.

## Contents

```
backend/          FastAPI app, tests and data scripts
frontend/         React + Vite app, with the nginx config used to serve it
data/             ABIDE time series, phenotypics and the wavelet data
papers/           VCBM 2026 abstract and poster (PDF)
docker-compose.yml
references.bib    BibTeX for the papers in the References section
```

## Running with Docker

The easiest way to run the application is with [Docker](https://docs.docker.com/get-started/get-docker/) and the [Compose plugin](https://docs.docker.com/compose/install/), which comes with Docker Desktop. With the `data/` folder in place (see [Data](#data)), run from the project root:

```bash
docker compose up --build
```

The first build takes a few minutes, after which the application is available at http://localhost:8080. It is only reachable from the same machine. The `data/` folder is mounted into the backend container as a read only volume, so the data is not copied into the image.

## Running locally

Running the application without Docker needs [Python](https://www.python.org/downloads/) 3.11 or 3.12, the Python package manager [uv](https://docs.astral.sh/uv/getting-started/installation/) and [Node.js](https://nodejs.org/en/download) 22 with npm. The development script installs the dependencies and starts both servers:

```bash
./dev.sh
```

The backend then runs on http://localhost:8000 and the frontend on http://localhost:5173. The two can also be started separately, each in its own terminal:

```bash
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev
```

The backend reads the data from `../data` relative to the `backend/` folder, which is where it sits in this project. It only accepts browser requests from the frontend at http://localhost:5173. If the frontend runs somewhere else, its address can be set in the `BRAINVIZ_CORS_ORIGINS` environment variable.

## Tests

The tests create their own synthetic data, so they run without the `data/` folder:

```bash
cd backend && uv sync && uv run pytest
cd frontend && npm install && npm test
```

## Deploying with Docker

The application runs as two Docker images, and only the data lives outside of them. `backend/Dockerfile` builds the API, which expects the `data/` folder at `/app/data`. `frontend/Dockerfile` builds the frontend and serves it with nginx, using `frontend/nginx.conf`. nginx passes all `/api/` requests on to a host called `brainviz-backend`, which is why the backend service has that name in `docker-compose.yml`.

The same `docker-compose.yml` works on a server. With the project and the `data/` folder copied over, `docker compose up -d --build` starts everything. The containers do not handle HTTPS, and the app is only published on `127.0.0.1:8080`, so on a public server it sits behind a reverse proxy on the same machine that handles HTTPS, such as Caddy, Traefik or a separate nginx. `frontend/nginx.conf` has a commented block for that case. Filling in the proxy's address there makes the rate limits apply to each visitor rather than to the proxy as a whole.

The compose file also limits what the containers can do. Both run with a read only filesystem, no extra Linux capabilities and limits on memory and CPU, and the backend has no internet access. nginx limits the API to 5 requests per second per IP address, and group averages, which take up to a minute to compute, to 20 per minute. Each backend worker also computes only one new group average at a time, while results it has already computed are returned straight away. The interactive API documentation is turned off by default and can be turned on with `BRAINVIZ_API_DOCS=1` on the backend.

## Data

All data is in the `data/` folder, and the application only reads from it. The folder is not stored in the repository. It can be downloaded as `brainviz-data.zip` from the [latest release](https://github.com/DanielEliad/brainviz/releases/latest), unzip it in the project root to create the `data/` directory:

```bash
curl -LO https://github.com/DanielEliad/brainviz/releases/latest/download/brainviz-data.zip
unzip brainviz-data.zip
```

| File | Contents | Source |
|------|----------|--------|
| `ABIDE/ABIDE_{I,II}/<site>/dr_stage1_subject<ID>.txt` | Time series per subject, one column per ICA component (32 columns) | Group ICA followed by dual regression on the ABIDE resting state fMRI scans. The files were provided as is from `\\EEMATLAB-OP01\neurodynamics\data\ABIDE\timeSeries`, see `data/readMe.txt` |
| `RSNs32.xlsx` | Which of the 32 components are RSNs, and their names | Same source |
| `phenotypics.csv` | The diagnosis (ASD or HC) of each subject | Same source |
| `wavelet.h5` | Wavelet phase maps for all 182 directed RSN pairs and all subjects (about 11 GB) | The MATLAB pipeline described below |

Pearson and Spearman are computed on the fly. For each request the backend takes the 14 RSN columns from the time series and computes the sliding window correlations (`backend/app/abide_processing.py`).

### ABIDE license

The time series are derived from the ABIDE I and ABIDE II datasets. ABIDE is shared under the Creative Commons Attribution, NonCommercial, ShareAlike license, which allows use for non commercial research only, and asks that the datasets used are named and their funding sources acknowledged. The same terms apply to the data in this package. The full usage agreement and the funding acknowledgements are on the [ABIDE I](https://fcon_1000.projects.nitrc.org/indi/abide/abide_I.html) and [ABIDE II](https://fcon_1000.projects.nitrc.org/indi/abide/abide_II.html) pages. Work using the data should also cite the two ABIDE papers:

- Di Martino, A., Yan, C.-G., Li, Q., Denio, E., Castellanos, F. X., Alaerts, K., Anderson, J. S., Assaf, M., Bookheimer, S. Y., Dapretto, M., Deen, B., Delmonte, S., Dinstein, I., Ertl-Wagner, B., Fair, D. A., Gallagher, L., Kennedy, D. P., Keown, C. L., Keysers, C., et al. (2013). The autism brain imaging data exchange: towards a large-scale evaluation of the intrinsic brain architecture in autism. Molecular Psychiatry, 19(6), 659–667. [https://doi.org/10.1038/mp.2013.78](https://doi.org/10.1038/mp.2013.78)
- Di Martino, A., O’Connor, D., Chen, B., Alaerts, K., Anderson, J. S., Assaf, M., Balsters, J. H., Baxter, L., Beggiato, A., Bernaerts, S., Blanken, L. M. E., Bookheimer, S. Y., Braden, B. B., Byrge, L., Castellanos, F. X., Dapretto, M., Delorme, R., Fair, D. A., Fishman, I., et al. (2017). Enhancing studies of the connectome in autism using the autism brain imaging data exchange II. Scientific Data, 4(1). [https://doi.org/10.1038/sdata.2017.10](https://doi.org/10.1038/sdata.2017.10)

### Wavelet data

The wavelet coherence maps were not computed as part of this project. They come from existing MATLAB code written by Ramona Cîrstian and Antoine Bernas for their wavelet coherence studies, which Sjir Schielen later adapted to the ABIDE data. The method is described in Cîrstian et al. (2023) and Bernas et al. (2018), and the code builds on the wavelet coherence toolbox of Grinsted et al. (2004). The full references are at the end of this file.

The code and its results are not part of this package. They are on the TU/e server EEMATLAB-OP01, in the `neurodynamics` share, which is the `D:` drive when logged in on the server itself.

| Contents | Location |
|----------|----------|
| Input time series | `\\EEMATLAB-OP01\neurodynamics\data\ABIDE\timeSeries` |
| Wavelet code | `\\EEMATLAB-OP01\neurodynamics\data\ABIDE\Wavelet\Ramona` |
| Coherence maps (`Coherence_<RSN1>_<RSN2>.mat`, all subjects per file) | `\\EEMATLAB-OP01\neurodynamics\data\ABIDE\Wavelet\Ramona\ABIDE\coherenceMaps` |
| Guides by previous students for the wavelet and Granger toolboxes | `\\EEMATLAB-OP01\neurodynamics\data\Ramona_Guides` |

In short, the MATLAB code computes the wavelet coherence between every pair of RSNs in both directions for every subject, using a Morlet wavelet, a TR of 2 seconds and 300 Monte Carlo surrogates for the significance test. It uses 50 scales plus 7 scales of padding, which is why `wavelet.h5` has 57 scales. The phase angles are then classified as in phase, leading, lagging or anti phase, and the result for each pair is saved as `Coherence_<RSN1>_<RSN2>.mat`.

The step from the `.mat` files to `data/wavelet.h5` was written for this project, in `backend/scripts/convert_wavelet_to_subject_files.py`:

```bash
cd backend
uv run python scripts/convert_wavelet_to_subject_files.py \
  --input-path /path/to/mats --output-path ../data/wavelet.h5 \
  --participants /path/to/participantStructs.mat \
  --phenotypics ../data/phenotypics.csv
```

With `--dry-run` the script only reports what it would do and writes nothing.

For the wavelet method, `backend/app/wavelet_processing.py` turns the phase maps into a leadership ratio per window. Only points where the coherence is significant in both directions of a pair are kept, and the ratio is the fraction of time and frequency points in the window at which one network leads the other. Only wavelet periods between 10 and 100 seconds are counted, matching the 0.01 to 0.1 Hz band the time series were filtered to.

### Overview tab data

The overview tab reads `frontend/public/overview_data.json`, which holds one full length correlation matrix per subject and method. Having these ready in a file saves the tab from making hundreds of API calls when it opens. The file is generated by `backend/scripts/generate_overview_asset.py`, which reads the data in `data/` and computes every matrix with the same backend code the API uses. It has to be run again whenever the data or a correlation method changes:

```bash
cd backend
uv run python scripts/generate_overview_asset.py
```

## Adding a correlation method

A new correlation method touches a few places in both the backend and the frontend.

In the backend, the method names are in the `CorrelationMethod` enum in `backend/app/rsn_constants.py`. The matrix functions for Pearson and Spearman are in `backend/app/abide_processing.py`, as `pearson_matrix()` and `spearman_matrix()`. They each take one window of data (time points × 14 RSNs) and return a 14 × 14 matrix, and `compute_correlation()` picks the right one for the requested method. The sliding window itself is done in `windowed_correlation()`. The wavelet method does not fit this pattern because it reads precomputed data, so it has its own branch at the top of `compute_correlation_matrices()`. Symmetric methods are listed in `is_symmetric()`, and for those the backend sends 91 edges per frame instead of 182.

In the frontend, the method names are in the `CorrelationMethod` type in `frontend/src/vis/useGraphData.ts`. The method pickers are in `frontend/src/ui/ControlPanel.tsx` and in `METHOD_OPTIONS` in `frontend/src/overview/OverviewTab.tsx`. The edge arrows and the toggle between showing both edges or only the stronger one are only turned on for the wavelet method, through the `method === "wavelet"` checks in `frontend/src/App.tsx` and `ControlPanel.tsx`.

The overview tab has its own list of methods in `METHODS` in `backend/scripts/generate_overview_asset.py` and in `SubjectEntry` in `frontend/src/overview/overviewCodec.ts`. `overview_data.json` only contains the methods it was generated with.

The backend returns raw values and the frontend reads the range from each response, so nothing is rescaled in the backend. The edge colours and thickness do use a fixed scale from -1 to 1, so that subjects can be compared with each other. Values outside that range are drawn at the end of the scale, which matters for a method with a much larger range. The scales are in `frontend/src/vis/drawFrame.ts`.

## Possible future improvements

The wavelet file `data/wavelet.h5` is much bigger than it needs to be. It is about 11 GB, while the same file zipped is only about 100 MB. The reason is that the conversion script saves the phase codes as uncompressed 64 bit floats, even though they only go from -2 to 2 and are mostly 0. Saving them as small integers with compression turned on would probably bring the file down to a similar size as the zip, and the backend would not need any changes to read it. This would be a change to the `create_dataset` call for `angle_maps` in `backend/scripts/convert_wavelet_to_subject_files.py`. It has not been tried yet, so the actual file size and the effect on loading speed are still open.

## References

These are some papers referenced in the poster abstract and used throughout the development of the project.

**ABIDE data and the RSNs**

- Schielen, S. J. C., Pilmeyer, J., Aldenkamp, A. P., Ruijters, D., & Zinger, S. (2025). ICA-Based Resting-State Networks Obtained on Large Autism fMRI Dataset ABIDE. Data, 10(7), 109. [https://doi.org/10.3390/data10070109](https://doi.org/10.3390/data10070109)
- Schielen, S. J. C., Pilmeyer, J., Aldenkamp, A. P., & Zinger, S. (2024). The diagnosis of ASD with MRI: a systematic review and meta-analysis. Translational Psychiatry, 14(1). [https://doi.org/10.1038/s41398-024-03024-5](https://doi.org/10.1038/s41398-024-03024-5)

**Wavelet coherence**

- Cirstian, R., Pilmeyer, J., Bernas, A., Jansen, J. F. A., Breeuwer, M., Aldenkamp, A. P., & Zinger, S. (2023). Objective biomarkers of depression: A study of Granger causality and wavelet coherence in resting‐state fMRI. Journal of Neuroimaging, 33(3), 404–414. [https://doi.org/10.1111/jon.13085](https://doi.org/10.1111/jon.13085)
- Bernas, A., Aldenkamp, A. P., & Zinger, S. (2018). Wavelet coherence-based classifier: A resting-state functional MRI study on neurodynamics in adolescents with high-functioning autism. Computer Methods and Programs in Biomedicine, 154, 143–151. [https://doi.org/10.1016/j.cmpb.2017.11.017](https://doi.org/10.1016/j.cmpb.2017.11.017)
- Bernas, A., Breuer, L. E. M., Aldenkamp, A. P., & Zinger, S. (2021). Emulative, coherent, and causal dynamics between large-scale brain networks are neurobiomarkers of Accelerated Cognitive Ageing in epilepsy. Plos One, 16(4), e0250222. [https://doi.org/10.1371/journal.pone.0250222](https://doi.org/10.1371/journal.pone.0250222)
- Grinsted, A., Moore, J. C., & Jevrejeva, S. (2004). Application of the cross wavelet transform and wavelet coherence to geophysical time series. Nonlinear Processes in Geophysics, 11(5/6), 561–566. [https://doi.org/10.5194/npg-11-561-2004](https://doi.org/10.5194/npg-11-561-2004)
- Torrence, C., & Compo, G. P. (1998). A Practical Guide to Wavelet Analysis. Bulletin of the American Meteorological Society, 79(1), 61–78. [https://doi.org/10.1175/1520-0477(1998)079&lt;0061:apgtwa&gt;2.0.co;2](https://doi.org/10.1175/1520-0477%281998%29079%3C0061%3Aapgtwa%3E2.0.co%3B2)

**Dynamic functional connectivity**

- Hutchison, R. M., Womelsdorf, T., Allen, E. A., Bandettini, P. A., Calhoun, V. D., Corbetta, M., Della Penna, S., Duyn, J. H., Glover, G. H., Gonzalez-Castillo, J., Handwerker, D. A., Keilholz, S., Kiviniemi, V., Leopold, D. A., de Pasquale, F., Sporns, O., Walter, M., & Chang, C. (2013). Dynamic functional connectivity: Promise, issues, and interpretations. NeuroImage, 80, 360–378. [https://doi.org/10.1016/j.neuroimage.2013.05.079](https://doi.org/10.1016/j.neuroimage.2013.05.079)
- Preti, M. G., Bolton, T. A., & Van De Ville, D. (2017). The dynamic functional connectome: State-of-the-art and perspectives. NeuroImage, 160, 41–54. [https://doi.org/10.1016/j.neuroimage.2016.12.061](https://doi.org/10.1016/j.neuroimage.2016.12.061)
- Chang, C., & Glover, G. H. (2010). Time–frequency dynamics of resting-state brain connectivity measured with fMRI. NeuroImage, 50(1), 81–98. [https://doi.org/10.1016/j.neuroimage.2009.12.011](https://doi.org/10.1016/j.neuroimage.2009.12.011)
- Pilmeyer, J., Lamerichs, R., Schielen, S., Ramsaransing, F., van Kranen-Mastenbroek, V., Jansen, J. F. A., Breeuwer, M., & Zinger, S. (2024). Multi-modal MRI for objective diagnosis and outcome prediction in depression. NeuroImage: Clinical, 44, 103682. [https://doi.org/10.1016/j.nicl.2024.103682](https://doi.org/10.1016/j.nicl.2024.103682)

**Visualization**

- Beck, F., Burch, M., Diehl, S., & Weiskopf, D. (2016). A Taxonomy and Survey of Dynamic Graph Visualization. Computer Graphics Forum, 36(1), 133–159. [https://doi.org/10.1111/cgf.12791](https://doi.org/10.1111/cgf.12791)
