# File Change Policy

This project is frozen by default. Do not edit project files unless the user
has explicitly authorized the exact path for the current task.

## Allowed files

- For this policy setup only: `AGENTS.md` and `FILE_CHANGE_POLICY.md`.
- For future tasks: no files are pre-approved. Before editing, identify the
  exact files that need changes and ask the user to authorize those paths if
  they did not name them in the current request.
- Once authorized, edit only the authorized paths. Do not assume that
  authorization for one file includes its tests, documentation, generated
  output, or related files.

## Protected files

- Every project file not explicitly authorized for the current task.
- `.env` and other files containing secrets or local credentials.
- Generated, dependency, build-output, deployment-owned, and platform-owned
  files unless the user specifically authorizes the exact path and the task
  requires changing it.
- User attachments and other read-only snapshots.

## Required procedure before editing

1. Read this file at the start of every task that may change project files.
2. Inspect candidate files read-only and report the exact paths that need edits.
3. If any candidate path is not named or otherwise explicitly authorized by the
   user for this task, ask for authorization before editing.
4. Make changes only to authorized paths; do not broaden the scope.
5. After editing, verify that every changed path was authorized and report any
   validation performed.

Only the user may change this policy or grant exceptions. A request to change
the application does not by itself authorize changes to this policy.
