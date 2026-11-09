import type { Overview } from "./control-contract"

export type PageState =
  | { status: "idle"; attempt: number; data?: Overview }
  | { status: "loading"; attempt: number; data?: Overview }
  | { status: "ready"; attempt: number; data: Overview }
  | { status: "error"; attempt: number; data?: Overview; message: string }

type Event =
  | { type: "request" }
  | { type: "loaded"; attempt: number; data: Overview }
  | { type: "failed"; attempt: number; message: string }
export function transitionPage(state: PageState, event: Event): PageState {
  if (event.type === "request") return { status: "loading", attempt: state.attempt + 1, data: state.data }
  if (state.status !== "loading" || event.attempt !== state.attempt) return state
  if (event.type === "loaded") return { status: "ready", attempt: state.attempt, data: event.data }
  return { status: "error", attempt: state.attempt, data: state.data, message: event.message }
}
