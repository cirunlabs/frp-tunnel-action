# FRP Access GitHub Action

## Overview

**FRP Access** is a GitHub Action that allows you to expose a port from a GitHub
Actions runner to the internet using **Fast Reverse Proxy (FRP)**. This enables
remote SSH access or public access to any service running on the GitHub runner.

<!-- prettier-ignore-start -->
> [!NOTE]
> This action requires you to have an **FRP server** set up and running.
> Check out [fatedier/frp](https://github.com/fatedier/frp) for more information on setting up
> an FRP server. The `frp_port` should be the port that the FRP server listens
> on and it must be accessible from the GitHub Actions runner (from internet for
> GitHub hosted runners). Additionally, if you'd like to access the
> `remote_port` from the internet (instead of optionally from the frp server),
> you'll need to ensure that the `remote_port` on FRP server is accessible from
> the internet.
<!-- prettier-ignore-end -->

## Features

- 🔄 **Exposes any port from the GitHub Actions runner via your public frp
  server**
- 🔑 **Automatically fetches and configures SSH keys** for authentication
- 🚀 **Runs FRP in the background** and keeps the workflow alive
- ⏳ **Supports configurable timeout** for the session duration
- 🔧 **Works with any FRP server** with authentication

## Usage

### Example Workflow

This example exposes port **22** (SSH) from the GitHub Actions runner and maps
it to **port 10022** on the FRP server.

```yaml
name: FRP Access
on:
  push:
jobs:
  access-runner-via-frp:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Start FRP
        uses: aktech/frp-tunnel-action@v1
        with:
          frp_server: 'frp.example.com or your-frp-server-ip'
          frp_port: '7000'
          frp_token: 'your-secret-token'
          local_port: '22'
          remote_port: '10022'
          timeout_minutes: '60'
```

### Example Workflow with full frp client configuration

```yaml
name: FRP Access
on:
  push:
jobs:
  access-runner-via-frp:
    runs-on: ubuntu-latest
    steps:
      - name: Start FRP with custom config
        uses: aktech/frp-tunnel-action@v1
        with:
          timeout_minutes: '60'
          frp_client_config: |
            [common]
            server_addr = frp.example.com
            server_port = 7000
            token = your-secret-token

            [ssh]
            type = tcp
            local_port = 22
            remote_port = 10022

            [web]
            type = http
            local_port = 8080
            remote_port = 8080
```

## Inputs

| Name                | Description                                                                                                         | Required | Default |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| `frp_server`        | The address of the FRP server                                                                                       | ✅ Yes   | -       |
| `frp_port`          | The port FRP server listens on (default: 7000)                                                                      | ✅ Yes   | 7000    |
| `frp_token`         | Authentication token for FRP                                                                                        | ✅ Yes   | -       |
| `local_port`        | The port on the GitHub Actions runner to expose                                                                     | ❌ No    | -       |
| `remote_port`       | The remote public port to expose on the FRP server                                                                  | ❌ No    | -       |
| `protocol`          | The protocol to use for the exposed port.                                                                           | ❌ No    | -       |
| `frp_client_config` | Full FRPC client configuration in INI format. If provided, this will be used instead of local_port and remote_port. | ❌ No    | -       |
| `frp_version`       | The version of FRP to use                                                                                           | ❌ No    | 0.61.1  |
| `timeout_minutes`   | The maximum duration to keep the action alive (minutes)                                                             | ❌ No    | 2       |

### 🔧 Input Requirements

- Either `frp_client_config` OR both `local_port` and `remote_port` must be
  provided.
- If using `frp_client_config`, you can define multiple ports and advanced FRP
  settings in an INI format, and it will be used instead of `local_port` and
  `remote_port`.

## How It Works

1. **Installs FRP** on the GitHub Actions runner.
2. **Configures SSH access** by adding your GitHub SSH keys to the runner.
3. **Starts an FRP client** that connects to your FRP server.
4. **Exposes the selected port** to a remote public port.
5. **Keeps the session alive** for the specified duration.

## Example SSH Access

If you are exposing port **22** (SSH), you can connect using:

```sh
ssh -oPort=10022 runner@frp.example.com
```

## Notes

- Ensure your **FRP server is set up and running** before using this action.
- The **SSH keys are automatically added** from your GitHub account.
- This action works with **any FRP version and configuration**.

## Development

> [!NOTE]
>
> You'll need to have a reasonably modern version of
> [Node.js](https://nodejs.org) handy (20.x or later should work!). If you are
> using a version manager like [`nodenv`](https://github.com/nodenv/nodenv) or
> [`fnm`](https://github.com/Schniz/fnm), this template has a `.node-version`
> file at the root of the repository that can be used to automatically switch to
> the correct version when you `cd` into the repository. Additionally, this
> `.node-version` file is used by GitHub Actions in any `actions/setup-node`
> actions.

1. :hammer_and_wrench: Install the dependencies

   ```bash
   npm install
   ```

1. :building_construction: Package the TypeScript for distribution

   ```bash
   npm run bundle
   ```

1. :white_check_mark: Run the tests

   ```bash
   npm test
   ```

## License

This action is licensed under the **MIT License**.

## Author

Developed by [aktech](https://github.com/aktech). Contributions and feedback are
welcome!
