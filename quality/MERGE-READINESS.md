# Merge readiness — 2026-10-15

The PR branch includes main `2095313ddf94764cad0eb919a153259ff5213c85`. This is a merge into the PR branch, not a merge of the PR into main.

Validation: frozen application and quality installs, 18 offline tests, production build and packed-entrypoint smoke. All gates were executed individually so an early quality failure could not skip the application checks. Functional checks pass; the required quality status remains red for the findings below.

Knip reports the isSandboxHost and normalizeBaseUrl exports added by the new main as unused in both graphs. These findings remain errors.

Existing initial-adoption evidence was replayed against this main commit. Original owners and expiry dates remain intact; allowance values and clone ceilings were not increased. Obsolete allowances were retired. The remaining violations were not bootstrapped or suppressed.

This records code and package validation under the agreed acceptance of remaining quality debt. It does not assert that all of 1MSG-156 is complete or that a live platform deployment was tested. No release, deployment or live API call was run.
