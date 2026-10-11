# goal — a Claude Code mod

A pane beside the chat with the overall goal Claude is working toward: what it is, why it matters, and how far along it is.

```
Windowshade
Main, EQ and playlist fold to their title bars
▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ 2/5 steps
✓ 1. Geometry
✓ 2. State
▶ 3. Painters
○ 4. Wiring
○ 5. Tests
[ Chat ]  Clear  more
```

- **Chat** puts `Re [goal] <title>: ` in your prompt box so you can talk about the goal.
- **Clear** removes the goal, which goes into history.
- **more** shows why the goal matters and the earlier goals.

Claude keeps the goal itself. The mod gives it three tools:

- `set`: the title, a one-line summary, why, and the steps. Setting a new goal moves the old one to history.
- `step`: marks a step as doing or done. Only one step is in progress at a time.
- `get`: returns the goal as text.

Claude also gets a short instruction to set a goal for any work bigger than one reply. The goal as it stood when the session started goes into the session's prompt, so a new session, or the same one after a context summary, picks the work up again.

The goal is kept per project and survives restarts. The pane opens by itself while a goal is unfinished, and `/goal` shows or hides it.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install goal --marketplace dbroadhurst/claude-mod-goal
```

To turn it on for one project only, add this to the project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "claude-mod-goal": { "source": { "source": "github", "repo": "dbroadhurst/claude-mod-goal" } }
  },
  "enabledPlugins": { "goal@claude-mod-goal": true }
}
```

## Notes

- Built on Claude Code's function-hooks plugin API (Claude Code 2.1.294), which is early access and may change between releases.
- To develop, run `claude --plugin-dir <path>` from a clone. Check with `claude plugin validate .` and `claude plugin test .`.
- Pairs with [todos](https://github.com/dbroadhurst/claude-mod-todos) and [approvals](https://github.com/dbroadhurst/claude-mod-approvals).

MIT licensed.
