package ai.glm.acp.sdk.protocol.client.response;

import ai.glm.acp.sdk.protocol.jsonrpc.Response;

import static ai.glm.acp.sdk.protocol.client.response.WriteTextFileResponse.WriteTextFileResponseResult;

public class WriteTextFileResponse extends Response<WriteTextFileResponseResult> {
    public static class WriteTextFileResponseResult {
        // Empty result class as per schema
    }
}
