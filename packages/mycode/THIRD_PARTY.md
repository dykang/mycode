# Third-party sources

OpenCode's original MIT license remains in the repository root. This fork starts at
`anomalyco/opencode@7d5b72250890e0e89573b4cab42a003a48c20567` (`dev`, package version 2.2.5).
The GitHub “latest release” endpoint returned v1.19.5 when inspected; the fork deliberately follows the newer v2
development API, not that release tag. Reviewed reference commits are pinned in [sources.json](./sources.json).

| Project                 | Treatment in this increment                                                                                                                                                                           | License/source                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| OpenCode                | Actual upstream fork, original source and history retained                                                                                                                                            | [MIT](https://github.com/anomalyco/opencode/blob/dev/LICENSE)                                                   |
| Superpowers             | Three vendored skill directories: verification, systematic debugging, TDD; plugin registers them with `mycode-` IDs and rewrites two cross-skill names in memory                                      | [MIT copy](./third-party/superpowers-LICENSE), [source](https://github.com/obra/superpowers)                    |
| Open Ralph Wiggum       | Strict terminal-completion helpers adapted in `src/completion.ts`; only strict terminal-promise checking is used                                                                                      | [MIT copy](./third-party/ralph-LICENSE), [source](https://github.com/Th0rgal/open-ralph-wiggum)                 |
| Tlahey/harness          | Declarative step fields, bounded loops and memory-index design studied; `config.ts` adapts the declarative schema concepts for a conditional state machine. Original memory/runner code is not copied | [MIT notice retained](./third-party/harness-LICENSE), [source](https://github.com/Tlahey/harness)               |
| oh-my-opencode-slim     | Specialist/per-role model routing studied; independent sequential per-step routing implemented. No scheduler, council or plugin source copied                                                         | [MIT notice retained](./third-party/slim-LICENSE), [source](https://github.com/alvinunreal/oh-my-opencode-slim) |
| opencode-supermemory    | Scoped recall, explicit capture and bounded context studied. A separate local SQLite backend is implemented; no remote SDK or plugin source included                                                  | [Source](https://github.com/supermemoryai/opencode-supermemory), package declares MIT                           |
| Dynamic Context Pruning | No source or runtime dependency included. Optional duplicate-result handling is an independent implementation                                                                                         | [AGPL license](https://github.com/Tarquinen/opencode-dynamic-context-pruning/blob/master/LICENSE)               |
| Oh My OpenAgent         | No source or runtime dependency included; not treated as an MIT dependency                                                                                                                            | [Sustainable Use License](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/LICENSE.md)                  |

Vendored skill content is upstream material, including examples and support scripts. It is exposed as model guidance;
the runtime does not automatically execute its scripts. Supporting files stay beside their skill for relative reads.
These records describe actual adoption. They do not imply feature parity with the referenced projects.

The macOS package includes OpenCode's original MIT notice at `Contents/Resources/licenses/OpenCode-LICENSE`, this
adoption record alongside it, and reused plugin notices under `Contents/Resources/plugins/mycode/third-party/`.
