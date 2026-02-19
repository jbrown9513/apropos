# SSH Multiplexing Disabled for Remote Stability

## Overview
Intermittent remote disconnects were observed during project switches and session attach operations, including:

- `mux_client_request_session: session request failed: Session open refused by peer`
- `kex_exchange_identification: read: Connection reset by peer`

## Why this is implemented
Apropos now uses non-multiplexed SSH transport by default and in code (no ControlMaster shared channel).

This reduces channel contention and avoids shared master socket resets under frequent attach/poll/switch behavior.
