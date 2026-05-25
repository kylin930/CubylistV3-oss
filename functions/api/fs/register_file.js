// 递归确保上级虚拟文件夹在 KV 中也有对应的索引
async function ensureVirtualParentDirectories(kv, decodedPath) {
    const segments = decodedPath.split('/').filter(p => p);
    if (segments.length <= 1) return; // 第一级根目录下的文件不需要生成父目录

    for (let i = segments.length - 1; i > 0; i--) {
        const parentSegments = segments.slice(0, i);
        const currentFolderName = segments[i - 1]; 

        const grandParentPath = parentSegments.length === 1 ? "/" : "/" + parentSegments.slice(0, -1).join("/");
        const grandParentKey = `dir:${grandParentPath}`;

        const grandParentDataStr = await kv.get(grandParentKey);
        let list = [];
        if (grandParentDataStr) {
            list = JSON.parse(grandParentDataStr);
        }

        const exists = list.some(item => item.name === currentFolderName && item.is_dir);
        if (!exists) {
            const nowIso = new Date().toISOString();
            list.push({
                id: "dir-" + Math.random().toString(36).substring(2, 10),
                name: currentFolderName,
                size: 0,
                is_dir: true,
                modified: nowIso,
                created: nowIso,
                type: 1
            });
            await kv.put(grandParentKey, JSON.stringify(list));
        }
    }
}

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        });
    }

    try {
        if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

        const rawJson = await request.json();
        let { path, name, size, oss_key } = rawJson;

        if (!path || !name) {
            return new Response(JSON.stringify({ code: 400, message: "Missing required fields" }), { status: 400 });
        }

        // ==========================================
        // 🚀 核心修复：全数据强制 URL 解码规整
        // ==========================================
        let decodedPath = decodeURIComponent(path);
        let decodedName = decodeURIComponent(name);
        let decodedOssKey = decodeURIComponent(oss_key);

        // 如果名字依然包含多级路径，截取最后纯文件名
        if (decodedName.includes("/")) {
            decodedName = decodedName.substring(decodedName.lastIndexOf("/") + 1);
        }

        // 规范化路径头部
        if (!decodedPath.startsWith("/")) decodedPath = "/" + decodedPath;
        if (decodedPath.length > 1 && decodedPath.endsWith("/")) decodedPath = decodedPath.slice(0, -1);

        const kv = env.ALIST_KV;
        const nowIso = new Date().toISOString();

        // 1. 构建标准纯净的文件元数据
        const newFileMeta = {
            id: "file-" + Date.now() + Math.random().toString(36).substring(2, 5),
            name: decodedName, // 例如 "89990698_p0_master1200.jpg"
            size: size || 0,
            is_dir: false,
            modified: nowIso,
            created: nowIso,
            type: 0, 
            oss_key: decodedOssKey // 干净的无连接符无层级OSS文件名
        };

        // 2. 写入独立的虚拟文件元数据键 (file:/91/xxx.jpg)
        await kv.put(`file:${decodedPath}`, JSON.stringify(newFileMeta));

        // 3. 计算它的直接父虚拟路径
        const lastSlashIndex = decodedPath.lastIndexOf("/");
        const parentPath = lastSlashIndex === 0 ? "/" : decodedPath.substring(0, lastSlashIndex);
        const dirKey = `dir:${parentPath}`;

        const existingDirStr = await kv.get(dirKey);
        let dirContentList = [];
        if (existingDirStr) {
            dirContentList = JSON.parse(existingDirStr);
        }

        // 去重覆盖旧的同名元数据
        dirContentList = dirContentList.filter(item => item.name !== decodedName);
        dirContentList.push(newFileMeta);

        // 4. 更新直接父目录的 KV 索引键
        await kv.put(dirKey, JSON.stringify(dirContentList));

        // 5. 递归补全更高层级的文件夹骨架
        await ensureVirtualParentDirectories(kv, decodedPath);

        return new Response(JSON.stringify({ 
            code: 200, 
            message: "Success",
            debug_saved_path: decodedPath,
            debug_saved_parent: parentPath
        }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "VFS Safe Register error: " + error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }
}