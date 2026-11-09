import { For, Show, onCleanup, onMount } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Command, Plugin, SettingsPage, Style, usePlugin } from "@opencode/plugin/gui"
import { Control } from "./control-contract"
import { transitionPage, type PageState } from "./gui-state"

const en = {
  title: "MyCode",
  subtitle: "Project memory, verified workflows, and context controls",
  open: "Open MyCode",
  project: "Project directory",
  projectPlaceholder: "/path/to/your/project",
  load: "Load project",
  refresh: "Refresh",
  memory: "Memory",
  workflow: "Workflow",
  context: "Context & skills",
  local: "Local project memory",
  memoryDescription: "Durable facts stored on this Mac. Search is lexical; nothing is sent to a memory service.",
  search: "Search memories",
  searchButton: "Search",
  fact: "New project fact",
  save: "Save memory",
  forget: "Forget",
  noMemories: "No matching memories. Save a durable fact to begin.",
  noProject: "Load a project directory to inspect its memory and workflows.",
  workflowDescription:
    "Run the project's mycode.yaml. Failure transitions return to repair; only a terminal verification command can pass.",
  task: "Task",
  taskPlaceholder: "Describe the change and acceptance criteria",
  start: "Run workflow",
  noWorkflow: "No mycode.yaml found. Run mycode init in this project, then set its verification commands.",
  recent: "Run history",
  noRuns: "No workflow runs yet.",
  next: "Next step",
  attempts: "Attempts",
  attempt: "Attempt",
  step: "Step",
  result: "Result",
  transitions: "Transitions (arrows show the next step)",
  success: "Pass →",
  failure: "Fail →",
  defaultModel: "Configured default model",
  command: "Verification command",
  stop: "Stop",
  resume: "Resume",
  evidence: "Verification evidence",
  exit: "Exit code",
  policy: "Duplicate tool-output pruning",
  policyDescription:
    "Opt in to replace older identical text tool results with pointers. Recent messages, errors, calls and persisted history remain intact.",
  disabled: "Off",
  enabled: "On",
  skills: "Development skills",
  skillsDescription: "Loaded from Superpowers with source and MIT notices preserved.",
  limits: "What this version does",
  limitsDescription:
    "Sequential conditional workflows and per-step model routing. Parallel councils, semantic memory, automatic rollback, and measured model-quality gains are not implemented.",
  "status.running": "Running",
  "status.passed": "Passed",
  "status.failed": "Failed",
  "status.interrupted": "Interrupted",
  source: "Source",
  model: "Model",
  missingServer: "The local MyCode server is unavailable. Reopen this page when the server is connected.",
}

const css = `
.mycode-page{display:flex;flex-direction:column;gap:20px;color:var(--text-base);padding-bottom:32px}
.mycode-page h2{font-size:16px;font-weight:600;color:var(--text-strong);margin-bottom:6px}
.mycode-page p{font-size:13px;line-height:1.65;color:var(--text-weak)}
.mycode-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.mycode-grow{flex:1;min-width:200px}
.mycode-tabs{display:flex;gap:8px;border-bottom:1px solid var(--border-weak-base);padding-bottom:14px}
.mycode-card{border:1px solid var(--border-weak-base);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:10px;background:var(--surface-raised-base)}
.mycode-card code,.mycode-page pre{font-family:var(--font-family-mono);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.mycode-tag{font-size:11px;border:1px solid var(--border-weak-base);padding:3px 8px;border-radius:20px;color:var(--text-strong)}
.mycode-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.mycode-error{color:var(--text-diff-delete-base);white-space:pre-wrap}.mycode-muted{font-size:12px;color:var(--text-weak)}
`

function Page() {
  const ctx = usePlugin()
  const ui = ctx.ui
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const [view, setView] = createStore({
    project: ctx.sessions.current()?.location?.directory ?? "",
    query: "",
    content: "",
    task: "",
    tab: "memory",
    page: { status: "idle", attempt: 0 } as PageState,
  })
  const busy = () => view.page.status === "loading"
  const changePage = (state: PageState) =>
    setView(
      produce((draft) => {
        draft.page = state
      }),
    )
  const data = () => view.page.data
  const server = () =>
    ctx.servers
      .list()
      .map((id) => ctx.servers.get(id))
      .find((item) => item?.builtin && item.connected)
  const api = () => {
    const current = server()
    if (!current) throw new Error(ctx.t("missingServer"))
    return current.client.rpc(Control)
  }
  const request = async (
    action?: (client: ReturnType<typeof api>, location: { directory: string }) => Promise<unknown>,
  ) => {
    if (busy()) return
    changePage(transitionPage(view.page, { type: "request" }))
    const attempt = view.page.attempt
    const location = { directory: view.project }
    try {
      const client = api()
      if (action) await action(client, location)
      const result = await client.overview({ query: view.query }, { location, signal: controller.signal })
      if (!controller.signal.aborted) changePage(transitionPage(view.page, { type: "loaded", attempt, data: result }))
    } catch (error) {
      if (!controller.signal.aborted)
        changePage(transitionPage(view.page, { type: "failed", attempt, message: String(error) }))
    }
  }
  onMount(() => {
    if (view.project) void request()
  })
  return (
    <ui.SettingsLayout title={ctx.t("title")} description={ctx.t("subtitle")}>
      <div class="mycode-page">
        <div class="mycode-row">
          <div class="mycode-grow">
            <ui.TextInput
              label={ctx.t("project")}
              placeholder={ctx.t("projectPlaceholder")}
              value={view.project}
              disabled={busy()}
              onInput={(project) => {
                setView("project", project)
                changePage({ status: "idle", attempt: view.page.attempt + 1 })
              }}
              onSubmit={() => void request()}
            />
          </div>
          <ui.Button variant="contrast" disabled={!view.project || busy()} onClick={() => void request()}>
            {data() ? ctx.t("refresh") : ctx.t("load")}
          </ui.Button>
        </div>
        <Show when={view.page.status === "error"}>
          <p role="alert" class="mycode-error">
            {view.page.status === "error" ? view.page.message : ""}
          </p>
        </Show>
        <nav class="mycode-tabs" aria-label={ctx.t("title")}>
          <For each={["memory", "workflow", "context"]}>
            {(tab) => (
              <ui.Button variant={view.tab === tab ? "contrast" : "ghost"} onClick={() => setView("tab", tab)}>
                {ctx.t(tab)}
              </ui.Button>
            )}
          </For>
        </nav>
        <Show when={data()} fallback={<p>{ctx.t("noProject")}</p>}>
          {(loaded) => (
            <>
              <div class="mycode-muted">{loaded().root}</div>
              <Show when={view.tab === "memory"}>
                <section>
                  <h2>{ctx.t("local")}</h2>
                  <p>{ctx.t("memoryDescription")}</p>
                </section>
                <div class="mycode-row">
                  <div class="mycode-grow">
                    <ui.TextInput
                      label={ctx.t("search")}
                      type="search"
                      value={view.query}
                      onInput={(query) => setView("query", query)}
                      onSubmit={() => void request()}
                    />
                  </div>
                  <ui.Button disabled={busy()} onClick={() => void request()}>
                    {ctx.t("searchButton")}
                  </ui.Button>
                </div>
                <div class="mycode-card">
                  <ui.TextInput
                    label={ctx.t("fact")}
                    placeholder={ctx.t("fact")}
                    value={view.content}
                    onInput={(content) => setView("content", content)}
                    disabled={busy()}
                  />
                  <div>
                    <ui.Button
                      disabled={!view.content.trim() || busy()}
                      onClick={() =>
                        void request(async (client, location) => {
                          await client.save(
                            { content: view.content, kind: "decision", source: "desktop:user" },
                            { location, signal: controller.signal },
                          )
                          setView("content", "")
                        })
                      }
                    >
                      {ctx.t("save")}
                    </ui.Button>
                  </div>
                </div>
                <For each={loaded().memories} fallback={<p>{ctx.t("noMemories")}</p>}>
                  {(memory) => (
                    <article class="mycode-card">
                      <div class="mycode-row">
                        <span class="mycode-tag">{memory.kind}</span>
                        <span class="mycode-muted">
                          {ctx.t("source")}: {memory.source}
                        </span>
                      </div>
                      <div>{memory.content}</div>
                      <div class="mycode-row">
                        <code class="mycode-grow">{memory.id}</code>
                        <ui.Button
                          variant="danger"
                          size="small"
                          disabled={busy()}
                          onClick={() =>
                            void request((client, location) =>
                              client.forget({ id: memory.id }, { location, signal: controller.signal }),
                            )
                          }
                        >
                          {ctx.t("forget")}
                        </ui.Button>
                      </div>
                    </article>
                  )}
                </For>
              </Show>
              <Show when={view.tab === "workflow"}>
                <section>
                  <h2>{ctx.t("workflow")}</h2>
                  <p>{ctx.t("workflowDescription")}</p>
                </section>
                <Show when={loaded().workflow} fallback={<p>{ctx.t("noWorkflow")}</p>}>
                  {(workflow) => (
                    <>
                      <div class="mycode-row">
                        <span class="mycode-tag">{workflow().name}</span>
                        <span class="mycode-muted">
                          {ctx.t("attempts")}: ≤ {workflow().maxSteps}
                        </span>
                      </div>
                      <ui.TextInput
                        label={ctx.t("task")}
                        placeholder={ctx.t("taskPlaceholder")}
                        value={view.task}
                        disabled={busy()}
                        onInput={(task) => setView("task", task)}
                      />
                      <div>
                        <ui.Button
                          variant="contrast"
                          disabled={!view.task.trim() || busy()}
                          onClick={() =>
                            void request((client, location) =>
                              client.start({ task: view.task }, { location, signal: controller.signal }),
                            )
                          }
                        >
                          {ctx.t("start")}
                        </ui.Button>
                      </div>
                      <h2>{ctx.t("transitions")}</h2>
                      <div class="mycode-grid">
                        <For each={workflow().steps}>
                          {(step) => (
                            <article class="mycode-card">
                              <strong>{step.id}</strong>
                              <span class="mycode-muted">
                                {step.type === "agent"
                                  ? `${step.agent} · ${step.model ?? ctx.t("defaultModel")}`
                                  : ctx.t("command")}
                              </span>
                              <Show when={step.onSuccess}>
                                <code>
                                  {ctx.t("success")} {step.onSuccess}
                                </code>
                              </Show>
                              <Show when={step.onFailure}>
                                <code>
                                  {ctx.t("failure")} {step.onFailure}
                                </code>
                              </Show>
                            </article>
                          )}
                        </For>
                      </div>
                    </>
                  )}
                </Show>
                <h2>{ctx.t("recent")}</h2>
                <For each={loaded().runs} fallback={<p>{ctx.t("noRuns")}</p>}>
                  {(run) => (
                    <article class="mycode-card">
                      <div class="mycode-row">
                        <span class="mycode-tag">{ctx.t(`status.${run.status}`)}</span>
                        <strong class="mycode-grow">{run.task}</strong>
                        <Show when={run.status === "running"}>
                          <ui.Button
                            disabled={busy()}
                            onClick={() =>
                              void request((client, location) =>
                                client.cancel({ id: run.id }, { location, signal: controller.signal }),
                              )
                            }
                          >
                            {ctx.t("stop")}
                          </ui.Button>
                        </Show>
                        <Show when={run.next && run.status !== "running"}>
                          <ui.Button
                            disabled={busy()}
                            onClick={() =>
                              void request((client, location) =>
                                client.resume({ id: run.id }, { location, signal: controller.signal }),
                              )
                            }
                          >
                            {ctx.t("resume")}
                          </ui.Button>
                        </Show>
                      </div>
                      <code>{run.id}</code>
                      <p>
                        {ctx.t("attempts")}: {run.attempts}{" "}
                        <Show when={run.next}>
                          · {ctx.t("next")}: {run.next}
                        </Show>
                      </p>
                      <Show when={run.error}>
                        <p class="mycode-error">{run.error}</p>
                      </Show>
                      <table>
                        <caption class="mycode-muted">{ctx.t("evidence")}</caption>
                        <thead>
                          <tr>
                            <th>{ctx.t("attempt")}</th>
                            <th>{ctx.t("step")}</th>
                            <th>{ctx.t("result")}</th>
                            <th>{ctx.t("exit")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={run.history}>
                            {(event) => (
                              <tr>
                                <td>{event.attempt}</td>
                                <td>
                                  <code>{event.step}</code>
                                </td>
                                <td class={event.ok ? "" : "mycode-error"}>
                                  {ctx.t(event.ok ? "status.passed" : "status.failed")}
                                </td>
                                <td>{event.exitCode}</td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                      <For each={run.results}>
                        {(result) => (
                          <details>
                            <summary>
                              {result.step} · {ctx.t(result.ok ? "status.passed" : "status.failed")} · {ctx.t("exit")}{" "}
                              {result.exitCode}
                            </summary>
                            <pre>{result.output || "—"}</pre>
                          </details>
                        )}
                      </For>
                    </article>
                  )}
                </For>
              </Show>
              <Show when={view.tab === "context"}>
                <div class="mycode-card">
                  <h2>{ctx.t("policy")}</h2>
                  <p>{ctx.t("policyDescription")}</p>
                  <ui.Switch
                    label={ctx.t("policy")}
                    checked={loaded().prune}
                    disabled={busy()}
                    onChange={(enabled) =>
                      void request((client, location) =>
                        client.pruning({ enabled }, { location, signal: controller.signal }),
                      )
                    }
                  />
                </div>
                <section>
                  <h2>{ctx.t("skills")}</h2>
                  <p>{ctx.t("skillsDescription")}</p>
                </section>
                <For each={loaded().skills}>
                  {(skill) => (
                    <div class="mycode-card">
                      <code>{skill}</code>
                    </div>
                  )}
                </For>
                <div class="mycode-card">
                  <h2>{ctx.t("limits")}</h2>
                  <p>{ctx.t("limitsDescription")}</p>
                </div>
              </Show>
            </>
          )}
        </Show>
      </div>
    </ui.SettingsLayout>
  )
}

export default Plugin.define({
  i18n: { en },
  setup(ctx) {
    ctx.add(Style, css)
    ctx.add(SettingsPage, {
      id: "mycode",
      get title() {
        return ctx.t("title")
      },
      render: () => <Page />,
    })
    ctx.add(Command, () => ({ id: "open", title: ctx.t("open"), run: () => ctx.layout.settings("mycode") }))
  },
})
