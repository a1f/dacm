# Plan: Terminal Experience Redesign

## Status: DRAFT — Gathering Requirements

## Context

The current raw xterm.js PTY approach renders Claude Code's full TUI (header, status bar, cursor positioning, ANSI escapes). The user wants a better rendering experience that:
- Shows the full conversation clearly (like terminal, but cleaner)
- Keeps ALL signals from Claude (tool use, thinking, errors, diffs, progress)
- Has a text input area with Claude-like triggers
- Renders output on top, input on bottom
- Uses a dark charcoal background color
- Is extensible for future model backends (Codex, Gemini)

## Open Questions

(To be filled after user clarification)

## Approach Options

### Option A: Keep PTY + Better Rendering
Keep the PTY/xterm.js approach but:
- Change background/theme colors
- Add our own input overlay at bottom
- Potentially parse ANSI output to extract structure

Pros: Zero signal loss, full Claude TUI fidelity
Cons: Hard to separate input from output, hard to add our own UI elements

### Option B: `claude -p --output-format stream-json`
Spawn Claude in print mode with structured JSON output:
- Parse all event types (text, tool_use, tool_result, thinking, errors)
- Render each event type with appropriate UI
- Our own input area for multi-turn (`--resume`)
- Full control over rendering

Pros: Clean rendering, extensible to other models, full control
Cons: May miss some TUI-only signals, no interactive tool approval (need permission flags)

### Option C: Hybrid — PTY for interaction, parsed overlay for display
Keep PTY running but also capture/parse output to build a parallel rendered view.
User can toggle between raw terminal and rendered view.

Pros: Full fidelity + nice rendering
Cons: Complex, two rendering paths to maintain

## Architecture Considerations

- Multi-model support: Backend should abstract the "AI session" concept so Claude, Codex, Gemini can implement the same interface
- Signal preservation: Need to enumerate ALL signals Claude emits and ensure they're captured
- Input features: What Claude-like input triggers to support (tab completion, slash commands, file refs?)

## Files

| File | Role |
|------|------|
| `core/src/session.rs` | Session abstraction (model-agnostic) |
| `core/src/session_commands.rs` | Tauri command interface |
| `view/src/chat-view.ts` | Message rendering component |
| `view/src/chat-state.ts` | Message state management |
| `view/src/style.css` | New styles + background color |
