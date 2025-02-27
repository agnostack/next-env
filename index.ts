/* eslint-disable import/no-extraneous-dependencies */
import * as fs from 'fs'
import * as path from 'path'
import * as dotEnvFlow from 'dotenv-flow'
import { expand as dotenvExpand } from 'dotenv-expand'

export type Env = { [key: string]: string }
export type LoadedEnvFiles = Array<{
  path: string
  contents: string
}>

let combinedEnv: Env | undefined = undefined
let cachedLoadedEnvFiles: LoadedEnvFiles = []

type Log = {
  info: (...args: any[]) => void
  error: (...args: any[]) => void
}

export function processEnv(
  loadedEnvFiles: LoadedEnvFiles,
  dir?: string,
  log: Log = console
) {
  // don't reload env if we already have since this breaks escaped
  // environment values e.g. \$ENV_FILE_KEY
  if (process.env.__NEXT_PROCESSED_ENV || loadedEnvFiles.length === 0) {
    return process.env as Env
  }
  // flag that we processed the environment values in case a serverless
  // function is re-used or we are running in `next start` mode
  process.env.__NEXT_PROCESSED_ENV = 'true'

  const origEnv = Object.assign({}, process.env)
  const parsed: dotEnvFlow.DotenvParseOutput = {}

  for (const envFile of loadedEnvFiles) {
    try {
      let result: dotEnvFlow.DotenvLoadOutput = {}
      result.parsed = dotEnvFlow.parse(envFile.path)

      result = dotenvExpand(result)

      if (result.parsed) {
        log.info(`Loaded env from ${path.join(dir || '', envFile.path)}`)
      }

      for (const key of Object.keys(result.parsed || {})) {
        if (
          typeof parsed[key] === 'undefined' &&
          typeof origEnv[key] === 'undefined'
        ) {
          parsed[key] = result.parsed?.[key]!
        }
      }
    } catch (err) {
      log.error(
        `Failed to load env from ${path.join(dir || '', envFile.path)}`,
        err
      )
    }
  }

  return Object.assign(process.env, parsed)
}

export function loadEnvConfig(
  dir: string,
  dev?: boolean,
  log: Log = console
): {
  combinedEnv: Env
  loadedEnvFiles: LoadedEnvFiles
} {
  // don't reload env if we already have since this breaks escaped
  // environment values e.g. \$ENV_FILE_KEY
  if (combinedEnv) return { combinedEnv, loadedEnvFiles: cachedLoadedEnvFiles }

  const isTest = process.env.NODE_ENV === 'test'
  const isDev = dev ?? process.env.NODE_ENV === 'development'
  const _environment = [
    process.env.BUILD_ENV,
    process.env.SITE_ENV,
    process.env.ENVIRONMENT,
    isTest ? 'test' : isDev ? 'development' : 'production'
  ].find(Boolean) as string

  // move to listFiles instead of listDotenvFiles after version 4.0.0
  const dotenvFiles = dotEnvFlow.listDotenvFiles(dir, {
    node_env: _environment,
  })

  for (const dotEnvFile of dotenvFiles) {
    // only load .env if the user provided has an env config file
    try {
      const stats = fs.statSync(dotEnvFile)

      // make sure to only attempt to read files
      if (!stats.isFile()) {
        continue
      }

      const contents = fs.readFileSync(dotEnvFile, 'utf8')
      cachedLoadedEnvFiles.push({
        path: dotEnvFile,
        contents,
      })
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        log.error(`Failed to load env from ${dotEnvFile}`, err)
      }
    }
  }
  combinedEnv = processEnv(cachedLoadedEnvFiles, dir, log)
  return { combinedEnv, loadedEnvFiles: cachedLoadedEnvFiles }
}
