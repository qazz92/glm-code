# Product Notes

GLM Code Testbed is a compact project designed to exercise agentic coding workflows without external dependencies.

The project has three layers:

1. A JavaScript task domain in `src/taskStore.mjs`.
2. A small command-line entrypoint in `bin/glm-testbed.mjs`.
3. A Python text utility in `py/glm_code_testbed/text_stats.py`.

All behavioral changes should update tests and this documentation when relevant.
