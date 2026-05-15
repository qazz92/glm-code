# GLM Code: Terms of Service and Privacy Notice

GLM Code is an open-source AI coding assistant tool maintained by the GLM Code team. This document outlines the terms of service and privacy policies that apply when using GLM Code's authentication methods and AI model services.

## How to determine your authentication method

GLM Code supports three authentication methods to access AI models. Your authentication method determines which terms of service and privacy policies apply to your usage:

1. **GLM OAuth** — Log in with your glm.ai account (free tier discontinued 2026-04-15)
2. **Alibaba Cloud Coding Plan** — Use an API key from Alibaba Cloud
3. **API Key** — Bring your own API key

For each authentication method, different Terms of Service and Privacy Notices may apply depending on the underlying service provider.

| Authentication Method     | Provider          | Terms of Service                                                   | Privacy Notice                                                     |
| :------------------------ | :---------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------- |
| GLM OAuth                | GLM AI           | [GLM Terms of Service](https://glm.ai/termsservice)              | [GLM Privacy Policy](https://glm.ai/privacypolicy)               |
| Alibaba Cloud Coding Plan | Alibaba Cloud     | See [details below](#2-if-you-are-using-alibaba-cloud-coding-plan) | See [details below](#2-if-you-are-using-alibaba-cloud-coding-plan) |
| API Key                   | Various Providers | Depends on your chosen API provider (OpenAI, Anthropic, etc.)      | Depends on your chosen API provider                                |

## 1. If you are using GLM OAuth Authentication

When you authenticate using your glm.ai account, these Terms of Service and Privacy Notice documents apply:

- **Terms of Service:** Your use is governed by the [GLM Terms of Service](https://glm.ai/termsservice).
- **Privacy Notice:** The collection and use of your data is described in the [GLM Privacy Policy](https://glm.ai/privacypolicy).

For details about authentication setup, quotas, and supported features, see [Authentication Setup](../configuration/settings).

## 2. If you are using Alibaba Cloud Coding Plan

When you authenticate using an API key from Alibaba Cloud, the applicable Terms of Service and Privacy Notice from Alibaba Cloud apply.

Alibaba Cloud Coding Plan is available in two regions:

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> When using Alibaba Cloud Coding Plan, you are subject to Alibaba Cloud's terms and privacy policies. Please review their documentation for specific details about data usage, retention, and privacy practices.

## 3. If you are using your own API Key

When you authenticate using API keys from other providers, the applicable Terms of Service and Privacy Notice depend on your chosen provider.

> [!important]
>
> When using your own API key, you are subject to the terms and privacy policies of your chosen API provider, not GLM Code's terms. Please review your provider's documentation for specific details about data usage, retention, and privacy practices.

GLM Code supports various OpenAI-compatible providers. Please refer to your specific provider's terms of service and privacy policy for detailed information.

## Usage Statistics and Telemetry

GLM Code may collect anonymous usage statistics and [telemetry](../../developers/development/telemetry) data to improve the user experience and product quality. This data collection is optional and can be controlled through configuration settings.

### What Data is Collected

When enabled, GLM Code may collect:

- Anonymous usage statistics (commands run, performance metrics)
- Error reports and crash data
- Feature usage patterns

### Data Collection by Authentication Method

- **GLM OAuth:** Usage statistics are governed by GLM's privacy policy. You can opt-out through GLM Code's configuration settings.
- **Alibaba Cloud Coding Plan:** Usage statistics are governed by Alibaba Cloud's privacy policy. You can opt-out through GLM Code's configuration settings.
- **API Key:** No additional data is collected by GLM Code beyond what your chosen API provider collects.

## Frequently Asked Questions (FAQ)

### 1. Is my code, including prompts and answers, used to train AI models?

Whether your code, including prompts and answers, is used to train AI models depends on your authentication method and the specific AI service provider you use:

- **GLM OAuth**: Data usage is governed by [GLM's Privacy Policy](https://glm.ai/privacy). Please refer to their policy for specific details about data collection and model training practices.

- **Alibaba Cloud Coding Plan**: Data usage is governed by Alibaba Cloud's privacy policy. Please refer to their policy for specific details about data collection and model training practices.

- **API Key**: Data usage depends entirely on your chosen API provider. Each provider has their own data usage policies. Please review the privacy policy and terms of service of your specific provider.

**Important**: GLM Code itself does not use your prompts, code, or responses for model training. Any data usage for training purposes would be governed by the policies of the AI service provider you authenticate with.

### 2. What are Usage Statistics and what does the opt-out control?

The **Usage Statistics** setting controls optional data collection by GLM Code for improving the user experience and product quality.

When enabled, GLM Code may collect:

- Anonymous telemetry (commands run, performance metrics, feature usage)
- Error reports and crash data
- General usage patterns

**What is NOT collected by GLM Code:**

- Your code content
- Prompts sent to AI models
- Responses from AI models
- Personal information

The Usage Statistics setting only controls data collection by GLM Code itself. It does not affect what data your chosen AI service provider (GLM, OpenAI, etc.) may collect according to their own privacy policies.

### 3. How do I switch between authentication methods?

You can switch between GLM OAuth, Alibaba Cloud Coding Plan, and your own API key at any time:

1. **During startup**: Choose your preferred authentication method when prompted
2. **Within the CLI**: Use the `/auth` command to reconfigure your authentication method
3. **Environment variables**: Set up `.env` files for automatic API key authentication

For detailed instructions, see the [Authentication Setup](../configuration/settings#environment-variables-for-api-access) documentation.
