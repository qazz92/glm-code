package ai.glm.acp.sdk.protocol.client.response.terminal;

import ai.glm.acp.sdk.protocol.jsonrpc.Response;

import static ai.glm.acp.sdk.protocol.client.response.terminal.KillTerminalCommandResponse.KillTerminalCommandResponseResult;

public class KillTerminalCommandResponse extends Response<KillTerminalCommandResponseResult> {
    public static class KillTerminalCommandResponseResult {
        // Empty result class as per schema
    }
}
