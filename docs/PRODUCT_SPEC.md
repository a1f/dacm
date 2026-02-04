# DACM - Desktop Agentic Coding Manager

## Product Specification

**Author:** Alex Fetisov
**Date:** 2026-02-03
**Status:** Draft

---

## The Problem

Running multiple Claude Code sessions in parallel is powerful but chaotic. Today's workflow involves juggling tmux panes, terminal tabs, and VS Code windows with no unified view. Specific pain points:

- **No visibility** - Can't see at a glance what 7+ agents are doing, if they're stuck, or if they need input
- **Manual everything** - Starting sessions, creating worktrees, switching between contexts, restarting failed runs
- **No review flow** - Reading diffs in terminal, copy-pasting feedback, no structured approve/iterate cycle
- **Lost context** - Returning to a project after days and forgetting where things stand, what decisions were made
- **Scattered planning** - Product specs, designs, and implementation plans live in random markdown files with no connection to execution

---

## What DACM Is

A Tauri desktop app that gives you a single window to see, manage, and interact with all your Claude Code sessions and projects. Think Codex desktop app but for Claude Code, with added planning and project memory.

**Not an IDE. Not a Claude Code replacement. A control panel.**

---

## Target Users

Developers already using Claude Code CLI, git worktrees, and running multiple parallel agent sessions. Power users who want visibility and control.

---

## MVP

The goal: **replace the tmux/terminal juggling for daily use.**

### Dashboard

Home screen showing all registered projects at a glance.

- Project list with live status: active sessions, pending reviews, last activity
- Filter/search (must handle 7+ projects)
- Click into any project for detail view

### Session Management

Start, stop, and monitor Claude Code sessions from one place.

- Session list per project: status (running/idle/error/done), what it's working on
- Start a session: pick a worktree, give it a prompt, go
- Stop/restart sessions
- **Hybrid model**: spawn processes directly OR attach to existing tmux sessions — both show same structured status
- Status from multiple signals: Claude Code hooks, git activity, process state

### Worktree Management

- List, create, delete worktrees per repo
- Create worktree flow: branch → worktree → optionally start session
- Open any worktree in VS Code (button click)

### Code Review

- Diff viewer showing agent's changes (git diff based)
- Inline comments on specific lines
- Send feedback back to the Claude session — agent iterates
- Simple approve/reject per session

### Chat

- Separate conversation view per session
- Send messages to running sessions
- See conversation history

### Notifications

- macOS native notifications: session done, errored, needs review
- In-app badges and status indicators
- Webhook support (Slack, Discord, custom)

---

## After MVP

Features to build once MVP is working and in daily use. No version numbers — just prioritized next steps.

### Project Planning

Connect plans to execution.

- View/edit markdown plans with rich rendering (progress bars, status)
- Multi-phase documents: product spec → technical design → implementation plan (linked, suggested flow, not enforced)
- Launch sessions from plan steps, session completion updates step status (bidirectional)
- Plan versioning via git with DACM showing meaningful snapshots
- Templates from existing `~/.claude/templates/`

### Project Memory

Stop losing context when switching between projects.

- Decision log: what was decided, why, what alternatives were considered
- Current state snapshot: done, in progress, blocked, next steps
- Stored as markdown in the project repo (git-backed)
- Editable from DACM UI

### Skills & Agents Visibility

- Browse available skills and agents (catalog)
- See what's active in each running session (runtime)
- Edit configs visually instead of editing markdown files

### Advanced (Later)

- **Docker isolation** — run sessions in containers for safety/reproducibility
- **Smart task assignment** — DACM suggests which session/worktree for a task
- **Auto-retry policies** — configurable per session
- **Enhanced review** — PR creation, conversational review, review history
- **Multi-machine sync** — monitor sessions on other machines

---

## Key User Flows

**Start a task:**
Dashboard → project → new session → pick worktree → enter prompt → session runs → notification when done

**Review work:**
Notification arrives → click into session → see diff → add inline comments → send feedback → agent fixes → approve

**Check status:**
Open DACM → see all projects → 3 running, 1 needs review, 2 idle → click in for details

**Plan a feature (post-MVP):**
Project → new plan → write spec → create design → break into implementation steps → launch sessions from steps → track progress

**Resume after break (post-MVP):**
Open project → memory tab → see decisions, current state, next steps → start a session with context

---

## UI Sketch

```
┌──────────────────────────────────────────────────┐
│  DACM                           [notifications]  │
├──────────┬───────────────────────────────────────┤
│          │                                       │
│ Projects │        Main Content Area              │
│          │                                       │
│ > Proj A │  Sessions / Review / Chat / Plans     │
│   Proj B │                                       │
│   Proj C │  ┌───────────────────────────────┐    │
│   ...    │  │ ● feat/auth   Running         │    │
│          │  │ ◐ fix/bug     Review pending  │    │
│──────────│  │ ● feat/search Running         │    │
│ + Add    │  │ ○ main        Idle            │    │
│ Settings │  └───────────────────────────────┘    │
└──────────┴───────────────────────────────────────┘
```

---

## Technical Constraints

For architecture phase, not decisions yet:

- **Tauri** (Rust backend + web frontend)
- **Hybrid process model**: own processes + tmux attachment
- **Parsed status**: structured data from Claude Code hooks + git monitoring (not raw terminal mirroring)
- **Git as storage**: plans, designs, memory live in project repos
- Must handle 7+ concurrent sessions without lag