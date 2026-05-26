What I learned building the structural report validator:
- Implemented a lightweight, strict interface for report validation.
- Used regular expressions to detect mandatory fields: drives, position, stop-loss, ticker.
- Validator reports missing fields as warnings without failing the pipeline.
- Integration into synthesis.ts is non-breaking and only annotates the produced report when needed.
Notes: keep the interface stable and avoid introducing heavy dependencies.
