# PolyGraph Tasks

## Editor
- [ ] Add UI actions to create/remove actors and channels from the visual editor (drag-to-create, delete, duplicate).
- [ ] Add inline editing for actor/channel ids with validation + update all dependent references.
- [ ] Add connection creation in React Flow (draw edge to create channel) and keep model as source of truth.
- [ ] Add visual affordances for selected actors/channels when selected from diagnostics.

## Workspace UX
- [ ] Add persistent layout settings (editor mode, terminal height) to localStorage.
- [ ] Add diagnostics search and severity counters in the terminal panel.

## Verification
- [ ] Add `W_DISCONNECTED_GRAPH` and `W_UNUSED_ACTOR` warnings for graph analysis.
- [ ] Add hyperperiod summary view in results panel.

## Testing
- [ ] Add unit tests for rational parsing and consistency/liveness edge cases.
- [ ] Add UI tests for editor sync and terminal resize behavior.
