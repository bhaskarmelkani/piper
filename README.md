<h1 align="center">piper</h1>
<p align="center">
  <a href="https://github.com/bhaskarmelkani/piper/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/bhaskarmelkani/piper/ci.yml?style=flat-square&branch=main" /></a>
</p>

> New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

# Piper Monorepo

> **Looking for the piper coding agent?** See **[packages/coding-agent](packages/coding-agent)** for installation and usage.

Piper is a polished terminal coding agent forked from [pi](https://github.com/badlogic/pi-mono). It adds a refined UI layer on top of pi's core engine — piper does not replace pi's runtime, it builds on it.

## Packages

**Piper layer** (modified in this fork):

| Package | Description |
|---------|-------------|
| **[piper-ai](packages/coding-agent)** | Piper coding agent CLI — the `piper` binary |

**Pi core** (upstream, kept as-is for compatibility):

| Package | Description |
|---------|-------------|
| **[@mariozechner/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@mariozechner/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@mariozechner/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
| **[@mariozechner/pi-mom](packages/mom)** | Slack bot integration |
| **[@mariozechner/pi-web-ui](packages/web-ui)** | Web components for AI chat interfaces |
| **[@mariozechner/pi-pods](packages/pods)** | CLI for managing vLLM deployments on GPU pods |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).

## Development

```bash
bun install          # Install all dependencies
bun run build        # Build all packages
bun run check        # Lint, format, and type check
piper-local          # Run piper from local source
```

> **Note:** `bun run check` requires `bun run build` to be run first. The web-ui package uses `tsc` which needs compiled `.d.ts` files from dependencies.

## License

MIT
