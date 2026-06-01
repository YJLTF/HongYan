import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  invoke(channel: string, ...args: any[]): Promise<any> {
    return ipcRenderer.invoke(channel, ...args)
  },
  on(channel: string, callback: (...args: any[]) => void): () => void {
    const handler = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
