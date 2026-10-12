# Quality and ownership

Profile A, Node 24.19.0. SDK/tooling maintainers own this repository. The public package entrypoints are defined in package.json; framework registration and executable consumers must remain intact. Imports must be acyclic at runtime, production cannot import tests, and dependency boundaries are enforced in `.dependency-cruiser.cjs`. `quality.config.mjs` is the source inventory and exact generated-path declaration.

Configuration belongs in the existing config/bootstrap adapters; pure conversion/validation helpers must not gain transport or environment reads. SDK and HTTP calls belong in the existing transport/client adapters. Keep complete scenarios readable at their application entrypoints; avoid pass-through facade layers. Comments on new/changed functions describe purpose, inputs/results, invariants and relevant failure/resource ownership. Check comments against behavior rather than repeating the function name.

Install with the frozen lockfile, then `npm --prefix tools/quality ci`. Run `npm run hooks:install` for local Husky/lint-staged feedback. Run all commands listed in `.github/workflows/quality.yml` before review: formatter, static and typed ESLint, strict production/test typecheck, dependency-cruiser, both Knip graphs, jscpd runtime gate and full report, complexity, guard negative fixtures, tests, build and packed-entrypoint smoke. No CI skip variable disables typed lint.

Historical debt is recorded per finding in `quality/baselines`, with adoption SHA, evidence, owner, issue and expiry. Initial allowances are replayed against the default branch; new findings and increases are forbidden. Remove entries when fixed. Generated paths have producer provenance; authored tooling is always checked.

The `quality-required` job fails on failed/skipped/cancelled prerequisites. Configure branch protection to require it; YAML alone does not change server protection. Tests use isolated/local inputs; never point them at production services.
