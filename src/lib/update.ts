import { invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"

export const UPDATE_DOWNLOAD_PROGRESS_EVENT = "radishmd://update-download-progress"

export interface UpdateAsset {
  name: string
  download_url: string
  size: number
  is_preferred: boolean
}

export interface UpdateCheckResult {
  current_version: string
  latest_version: string
  release_name: string | null
  release_notes: string | null
  release_url: string
  published_at: string | null
  has_update: boolean
  assets: UpdateAsset[]
}

export interface UpdateDownloadProgress {
  download_id: string
  asset_name: string
  downloaded_bytes: number
  total_bytes: number | null
  progress: number | null
}

export async function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version")
}

export async function checkLatestRelease(): Promise<UpdateCheckResult> {
  return invoke<UpdateCheckResult>("check_latest_release")
}

export async function chooseUpdateSavePath(defaultName: string): Promise<string | null> {
  return save({ defaultPath: defaultName })
}

export async function downloadReleaseAsset(asset: UpdateAsset, savePath: string, downloadId: string): Promise<void> {
  await invoke("download_release_asset", {
    downloadId,
    assetName: asset.name,
    assetUrl: asset.download_url,
    savePath,
  })
}

export async function cancelDownload(downloadId: string): Promise<void> {
  await invoke("cancel_download", { downloadId })
}