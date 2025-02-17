import * as core from '@actions/core'
import * as os from 'os'
import * as crypto from 'crypto'
import * as github from '@actions/github'
import { exec } from '@actions/exec'
import { writeFileSync, appendFileSync, chmodSync } from 'fs'
import * as path from 'path'

/**
 * Fetches SSH keys for a GitHub user.
 * @param username - GitHub username
 */
async function fetchGitHubSSHKeys(username: string): Promise<string[]> {
  try {
    const url = `https://github.com/${username}.keys`
    core.info(`Fetching SSH keys from ${url}...`)

    const response = await fetch(url)
    if (!response.ok) {
      if (response.status === 404) {
        core.warning(`User ${username} does not have any SSH keys.`)
        return []
      }
      throw new Error(`Failed to fetch keys: ${response.statusText}`)
    }

    const keys = await response.text()
    const filteredKeys = keys.split('\n').filter((key) => key.trim().length > 0)

    if (filteredKeys.length === 0) {
      core.warning(`User ${username} has no SSH keys.`)
    }

    return filteredKeys
  } catch (error) {
    core.warning(`Could not fetch SSH keys for ${username}: ${error}`)
    return []
  }
}

/** @param {number} ms */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function postRun(): Promise<void> {
  core.info('Post-run cleanup...')
}

/**
 * The main function for the action.
 */
export async function run(): Promise<void> {
  try {
    if (core.getState('isPost')) {
      core.info('Post-run cleanup...')
      return await postRun()
    }

    const frpServer = core.getInput('frp_server')
    const frpServerPort = core.getInput('frp_server_port')
    const frpToken = core.getInput('frp_token')
    const localPort = core.getInput('local_port')
    const localIp = core.getInput('local_ip') || '127.0.0.1'
    const remotePort = core.getInput('remote_port')
    const protocol = core.getInput('protocol') || 'tcp'
    const frpVersion = core.getInput('frp_version') || '0.61.1' // Default to latest stable
    const platform = os.platform() // 'linux', 'darwin', 'win32'
    const arch = os.arch() // 'x64', 'arm64', 'ia32', etc.

    // Map Node.js arch and platform to FRP naming convention
    const platformMap: { [key: string]: string } = {
      linux: 'linux',
      darwin: 'darwin',
      win32: 'windows'
    }
    const archMap: { [key: string]: string } = {
      x64: 'amd64',
      arm64: 'arm64'
    }
    if (
      platformMap[platform] === undefined ||
      platformMap[platform] === 'windows'
    ) {
      // TODO: Add support for Windows
      core.setFailed(`Unsupported platform: ${platform}`)
      return
    }
    const timeoutMinutes = parseInt(core.getInput('timeout_minutes'), 10)
    const timeoutMs = timeoutMinutes * 60 * 1000
    const frpClientConfig = core.getInput('frp_client_config')

    const { actor, apiUrl } = github.context
    const homeUsername = os.userInfo().username
    core.info(`Running as ${actor} on ${apiUrl}`)

    // Ensure either frpClientConfig is provided OR both localPort and remotePort
    if (!frpClientConfig && (!localPort || !remotePort)) {
      core.setFailed(
        "Either 'frp_client_config' OR both 'local_port' and 'remote_port' must be provided."
      )
      return
    }
    // Fetch SSH keys
    const sshKeys = await fetchGitHubSSHKeys(actor)
    if (sshKeys.length === 0) {
      core.warning(`No SSH keys found for ${actor}`)
    }
    // Add SSH keys to the runner's authorized_keys
    const sshDir = path.join(
      process.env.HOME || `/home/${homeUsername}`,
      '.ssh'
    )
    const authKeysPath = path.join(sshDir, 'authorized_keys')

    core.info(`Setting up SSH access for ${actor}...`)
    await exec('mkdir', ['-p', sshDir])
    chmodSync(sshDir, '700')

    sshKeys.forEach((key) => appendFileSync(authKeysPath, key + '\n'))
    chmodSync(authKeysPath, '600')

    core.info(`SSH keys added to ${authKeysPath}`)

    // Install and start SSH server if not already running
    core.info('Starting SSH server...')
    if (platform === 'darwin') {
      await exec('sudo', ['systemsetup', '-setremotelogin', 'on'])
    } else if (platform === 'linux') {
      await exec('sudo', ['service', 'ssh', 'start'])
    }
    const frpFileName = `frp_${frpVersion}_${platformMap[platform]}_${archMap[arch]}.tar.gz`
    const frpURL = `https://github.com/fatedier/frp/releases/download/v${frpVersion}/${frpFileName}`
    const frpDir = path.join('/tmp', `frp_${frpVersion}`)
    const frpcConfigPath = path.join(frpDir, 'frpc.toml')

    core.info(`Downloading frp from ${frpURL}...`)
    await exec('wget', ['-q', '-O', '/tmp/frp.tar.gz', frpURL])

    core.info(`Extracting FRP to ${frpDir}...`)
    await exec('mkdir', ['-p', frpDir]) // Ensure target directory exists
    await exec('tar', [
      '-xzf',
      '/tmp/frp.tar.gz',
      '-C',
      frpDir,
      '--strip-components=1'
    ])

    // Verify extraction
    core.info(`Checking extracted FRP directory at ${frpDir}...`)
    await exec('ls', ['-lah', frpDir])

    const uniqueSuffix = `${process.env.GITHUB_RUN_ID}-${crypto.randomUUID()}`
    core.info(`frp client config unique suffix: ${uniqueSuffix}`)

    // Create the frpc.toml configuration file
    if (frpClientConfig) {
      // Use the provided FRPC client config
      core.info(`Using provided FRPC client config...`)
      writeFileSync(frpcConfigPath, frpClientConfig)
    } else {
      const frpcConfig = `
serverAddr = "${frpServer}"
serverPort = ${frpServerPort}
auth.token = "${frpToken}"

[[proxies]]
name = "github-runner-${uniqueSuffix}"
type = "${protocol}"
localIP = "${localIp}"
localPort = ${localPort}
remotePort = ${remotePort}
`

      core.info(`Writing frpc.toml to ${frpcConfigPath}:`)
      writeFileSync(frpcConfigPath, frpcConfig)
      core.info(`frpc.toml configuration created at ${frpcConfigPath}`)
    }
    // Start frpc in the background
    core.info('Starting frp client (frpc)...')

    // Instead of exec(), we use a long-running process to prevent early termination
    await exec('sh', [
      '-c',
      `nohup ${path.join(frpDir, 'frpc')} -c ${frpcConfigPath} > /tmp/frpc.log 2>&1 &`
    ])
    if (frpServer && remotePort) {
      core.setOutput('public_url', `${frpServer}:${remotePort}`)
    }
    // Keep the action alive until timeout
    const startTime = Date.now()
    while (true) {
      core.info('='.repeat(50))
      core.info(
        `FRP is running. Keeping the action alive for ${timeoutMinutes} minutes...`
      )
      if (localPort && remotePort) {
        core.info(
          `Port ${localPort} on the runner can be accessed from ${frpServer}:${remotePort}`
        )
      }
      if (localPort === '22') {
        core.info(
          `SSH server is running on port 22. You can now SSH into the runner via:`
        )
        core.info(`ssh -oPort=${remotePort} ${homeUsername}@${frpServer}`)
      }

      if (Date.now() - startTime > timeoutMs) {
        core.info('Timeout reached. Exiting the loop.')
        break
      }
      await exec('sh', ['-c', 'cat /tmp/frpc.log'])
      await sleep(5000)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
