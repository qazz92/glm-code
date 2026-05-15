package ai.glm.acp.sdk.protocol.domain.mcp;

import ai.glm.acp.sdk.protocol.jsonrpc.Meta;

public class HttpHeader extends Meta {
    private String name;
    private String value;

    // Getters and setters
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }
}
