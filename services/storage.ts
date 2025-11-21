
import { NovelMetadata, NovelData, Chunk, AppSettings, NovelBackup, GlobalGraph } from '../types';

const DB_NAME = 'NovelMindDB';
const DB_VERSION = 2; // Incremented for Schema Change if needed, though key-value stores are flexible
const STORE_META = 'novel_metadata';
const STORE_DATA = 'novel_data';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_DATA)) {
        db.createObjectStore(STORE_DATA, { keyPath: 'id' });
      }
    };
  });
};

export const saveNewNovel = async (
  title: string, 
  content: string, 
  chunks: Chunk[], 
  settings: AppSettings
): Promise<string> => {
  const db = await initDB();
  const id = crypto.randomUUID();
  const timestamp = Date.now();

  const metadata: NovelMetadata = {
    id,
    title,
    totalCharacters: content.length,
    chunkCount: chunks.length,
    analyzedChunkCount: 0,
    currentChunkIndex: 0,
    lastUpdated: timestamp,
    settings
  };

  const data: NovelData = {
    id,
    content,
    chunks,
    globalGraph: { nodes: [], links: [] } // Init empty graph
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META, STORE_DATA], 'readwrite');
    tx.objectStore(STORE_META).add(metadata);
    tx.objectStore(STORE_DATA).add(data);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
};

export const getAllNovels = async (): Promise<NovelMetadata[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const request = store.getAll();

    request.onsuccess = () => {
        const result = request.result as NovelMetadata[];
        resolve(result.sort((a, b) => b.lastUpdated - a.lastUpdated));
    };
    request.onerror = () => reject(request.error);
  });
};

export const loadNovel = async (id: string): Promise<{ metadata: NovelMetadata, data: NovelData }> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META, STORE_DATA], 'readonly');
    
    let metadata: NovelMetadata;
    let data: NovelData;
    let completed = 0;

    const checkDone = () => {
        completed++;
        if (completed === 2) {
            if (metadata && data) resolve({ metadata, data });
            else reject(new Error("Novel not found"));
        }
    };

    const reqMeta = tx.objectStore(STORE_META).get(id);
    reqMeta.onsuccess = () => { metadata = reqMeta.result; checkDone(); };
    
    const reqData = tx.objectStore(STORE_DATA).get(id);
    reqData.onsuccess = () => { data = reqData.result; checkDone(); };

    tx.onerror = () => reject(tx.error);
  });
};

export const updateNovelChunks = async (id: string, chunks: Chunk[], analyzedCount: number, globalGraph?: GlobalGraph): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META, STORE_DATA], 'readwrite');
    
    // 1. Update Data (Chunks & Graph)
    const dataStore = tx.objectStore(STORE_DATA);
    const dataReq = dataStore.get(id);
    
    dataReq.onsuccess = () => {
        const data = dataReq.result as NovelData;
        if (data) {
            data.chunks = chunks;
            if (globalGraph) {
                data.globalGraph = globalGraph;
            }
            dataStore.put(data);
        }
    };

    // 2. Update Metadata
    const metaStore = tx.objectStore(STORE_META);
    const metaReq = metaStore.get(id);

    metaReq.onsuccess = () => {
        const meta = metaReq.result as NovelMetadata;
        if (meta) {
            meta.analyzedChunkCount = analyzedCount;
            meta.chunkCount = chunks.length;
            meta.lastUpdated = Date.now();
            metaStore.put(meta);
        }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const updateNovelProgress = async (id: string, currentChunkIndex: number): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    const req = store.get(id);
    req.onsuccess = () => {
        const meta = req.result as NovelMetadata;
        if (meta) {
            meta.currentChunkIndex = currentChunkIndex;
            meta.lastUpdated = Date.now();
            store.put(meta);
            resolve();
        } else {
            reject("Novel not found");
        }
    };
    req.onerror = () => reject(req.error);
  });
};

export const updateNovelSettings = async (id: string, settings: AppSettings): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_META, 'readwrite');
        const store = tx.objectStore(STORE_META);
        const req = store.get(id);
        req.onsuccess = () => {
            const meta = req.result as NovelMetadata;
            if (meta) {
                meta.settings = settings;
                store.put(meta);
                resolve();
            } else {
                reject("Novel not found");
            }
        };
        req.onerror = () => reject(req.error);
    });
}

export const deleteNovel = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META, STORE_DATA], 'readwrite');
    tx.objectStore(STORE_META).delete(id);
    tx.objectStore(STORE_DATA).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// --- IMPORT / EXPORT ---

export const exportNovelAsJSON = async (id: string): Promise<string> => {
    const { metadata, data } = await loadNovel(id);
    const backup: NovelBackup = {
        metadata,
        data,
        version: 1
    };
    return JSON.stringify(backup);
};

export const importNovelFromJSON = async (jsonString: string): Promise<string> => {
    try {
        const backup: NovelBackup = JSON.parse(jsonString);
        
        // Validation check
        if (!backup.metadata || !backup.data || !backup.data.chunks) {
            throw new Error("Invalid file format");
        }

        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_META, STORE_DATA], 'readwrite');
            
            // Force a new ID to avoid conflicts if importing same book twice
            const newId = crypto.randomUUID();
            const newMeta = { ...backup.metadata, id: newId, lastUpdated: Date.now() };
            const newData = { ...backup.data, id: newId };

            tx.objectStore(STORE_META).add(newMeta);
            tx.objectStore(STORE_DATA).add(newData);

            tx.oncomplete = () => resolve(newId);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        throw e;
    }
};
