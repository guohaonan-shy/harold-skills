/**
 * 读上游脚本写下的 JSON 文件（供 paired-stats 等下游脚本用）。
 *
 * eval-run 把一个脚本的 stdout 重定向成文件，再交给下一个脚本。上游脚本失败时它的 stdout 是空的，
 * 文件就是空文件；直接 JSON.parse 只会报「Unexpected end of JSON input」，看不出哪一步没跑成。
 * 这里把「空文件」「不是 JSON」「读不了」分开说，空文件时指回上游脚本的 stderr。
 */
import { readFileSync } from 'node:fs'

export function readJson(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error.message}`)
  }
  if (text.trim() === '') {
    throw new Error(
      `${file} is empty: the script whose output was written there printed nothing, which means it failed; ` +
        'run that script again on its own and read its stderr',
    )
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${file} is not valid JSON (${error.message}); the script that wrote it may have printed an error there`)
  }
}
