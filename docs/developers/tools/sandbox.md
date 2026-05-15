## Customizing the sandbox environment (Docker/Podman)

### Currently, the project does not support the use of the BUILD_SANDBOX function after installation through the npm package

1. To build a custom sandbox, you need to access the build scripts (scripts/build_sandbox.js) in the source code repository.
2. These build scripts are not included in the packages released by npm.
3. The code contains hard-coded path checks that explicitly reject build requests from non-source code environments.

If you need extra tools inside the container (e.g., `git`, `python`, `rg`), create a custom Dockerfile, The specific operation is as follows

#### 1、Clone glm code project first, https://github.com/qazz92/glm-code.git

#### 2、Make sure you perform the following operation in the source code repository directory

```bash
# 1. First, install the dependencies of the project
npm install

# 2. Build the GLM Code project
npm run build

# 3. Verify that the dist directory has been generated
ls -la packages/cli/dist/

# 4. Create a global link in the CLI package directory
cd packages/cli
npm link

# 5. Verification link (it should now point to the source code)
which glm
# Expected output: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/glm
# Or similar paths, but it should be a symbolic link

# 6. For details of the symbolic link, you can see the specific source code path
ls -la $(dirname $(which glm))/../lib/node_modules/@glm-code/glm-code
# It should show that this is a symbolic link pointing to your source code directory

# 7.Test the version of glm
glm -v
# npm link will overwrite the global glm. To avoid being unable to distinguish the same version number, you can uninstall the global CLI first

```

#### 3、Create your sandbox Dockerfile under the root directory of your own project

- Path: `.glm/sandbox.Dockerfile`

- Official mirror image address:https://github.com/qazz92/glm-code/pkgs/container/glm-code

```bash
# Based on the official GLM sandbox image (It is recommended to explicitly specify the version)
FROM ghcr.io/qazz92/glm-code:sha-570ec43
# Add your extra tools here
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4、Create the first sandbox image under the root directory of your project

```bash
GLM_SANDBOX=docker BUILD_SANDBOX=1 glm -s
# Observe whether the sandbox version of the tool you launched is consistent with the version of your custom image. If they are consistent, the startup will be successful
```

This builds a project-specific image based on the default sandbox image.

#### Remove npm link

- If you want to restore the official CLI of glm, please remove the npm link

```bash
# Method 1: Unlink globally
npm unlink -g @glm-code/glm-code

# Method 2: Remove it in the packages/cli directory
cd packages/cli
npm unlink

# Verification has been lifted
which glm
# It should display "glm not found"

# Reinstall the global version if necessary
npm install -g @glm-code/glm-code

# Verification Recovery
which glm
glm --version
```
