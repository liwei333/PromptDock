# PromptDock Development Environment

Checked on 2026-10-13 (Asia/Shanghai).

| Item | Actual value |
|---|---|
| Hardware architecture | `arm64` |
| macOS | `26.4.1` (`25E253`) |
| Xcode | `26.4.1` (`17E202`) |
| Apple Clang | `21.0.0` |
| Node.js | `v25.6.0` |
| pnpm used for install | `10.34.5` |
| Rust | `rustc 1.92.0` |
| Cargo | `1.92.0` |
| Git | `2.54.0` |
| Tauri CLI | project-local `2.12.2` |
| Vue | `3.5.44` |
| Vite | `8.3.4` |

The standalone `cargo tauri` command was not installed. The project uses the locked local CLI through `pnpm tauri`, which is the official JavaScript-project workflow. The package archive contained 21 files and every entry passed `shasum -a 256 -c MANIFEST.sha256`.

The machine had roughly 40 GiB free on the data volume at the start of development. The target directory did not exist and was created as a new repository.
