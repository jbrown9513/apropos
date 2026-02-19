# Worktree Session Launch And VCS Mapping Rules

Session launch now supports selecting a project workspace before starting `tmux`, `codex`, or `claude`.

Users can choose:

- `main` project path
- an existing project worktree
- create a new worktree on launch

New worktrees are created under:

`~/.apropos/<project-id>/worktrees`

This applies to both local and remote-host projects (using the remote host's home directory for `~/.apropos`), keeping worktree state scoped per Apropos project and separate from the main checkout.

Git command behavior is now modularized under `src/plugins/`, and code-session startup now generates VCS mapping rules from user-provided JSON mapping config files. This enables teams using SVN-equivalent workflows to define 1:1 command mappings (for example mapping `git` commands to `svn` commands) and have those mappings automatically available in session rule files each time a code session starts.

Mappings can come from:

- `~/.apropos/plugins/vcs-mappings.json`
- any `vcs-mappings.json` file inside cloned repos under `~/.apropos/plugins/**`
- `<project>/.apropos/vcs-mappings.json` (project override)
