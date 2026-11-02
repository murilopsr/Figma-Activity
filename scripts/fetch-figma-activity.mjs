// Coleta versões e comentários de arquivos do Figma e gera public/figma-activity.json
// Requer Node 18+ (fetch nativo). Sem dependências.
//
// Uso local:
//   FIGMA_TOKEN=figd_xxx node scripts/fetch-figma-activity.mjs
//
// Escopos do token: file_versions:read, file_comments:read, current_user:read
// (opcional, só se usar "projectIds": projects:read)

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

const API = "https://api.figma.com/v1"
const TOKEN = process.env.FIGMA_TOKEN
const CONFIG_PATH = process.env.CONFIG_PATH || "figma-activity.config.json"

if (!TOKEN) {
    console.error("Defina a variável de ambiente FIGMA_TOKEN.")
    process.exit(1)
}

const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"))
const OUTPUT = config.output || "public/figma-activity.json"
const ONLY_ME = config.onlyMe !== false // por padrão conta só a sua atividade
const KEEP_DAYS = config.keepDays || 800
const MODIFIED = config.modifiedEvents === true // conta a "última modificação" dos arquivos de projectIds

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function figma(path, attempt = 0) {
    const url = path.startsWith("http") ? path : API + path
    const res = await fetch(url, { headers: { "X-Figma-Token": TOKEN } })
    if (res.status === 429 && attempt < 3) {
        const wait = Math.min(60, Number(res.headers.get("retry-after") || 10))
        console.warn("Limite de requisições atingido, aguardando " + wait + "s...")
        await sleep(wait * 1000)
        return figma(path, attempt + 1)
    }
    if (!res.ok) {
        const body = await res.text().catch(() => "")
        const err = new Error("Figma API " + res.status + " em " + path + ": " + body.slice(0, 200))
        err.status = res.status
        throw err
    }
    return res.json()
}

async function currentUserId() {
    const me = await figma("/me")
    return me.id
}

// Lista arquivos de projetos do Figma (opcional)
async function filesFromProjects(projectIds) {
    const out = []
    for (const p of projectIds) {
        const id = typeof p === "string" ? p : p.id
        const label = typeof p === "string" ? undefined : p.project
        const deep = typeof p === "object" && p.deep === true // true = também busca versões e comentários de cada arquivo
        try {
            const data = await figma("/projects/" + id + "/files")
            for (const f of data.files || []) out.push({ key: f.key, project: label || data.name || id, modified: f.last_modified, modifiedOnly: !deep })
        } catch (e) {
            console.warn("Não consegui listar o projeto " + id + ": " + e.message)
        }
    }
    return out
}

// Descobre todos os projetos (pastas) de cada time informado em "teamIds"
async function projectsFromTeams(teamIds, deep) {
    const out = []
    for (const teamId of teamIds) {
        try {
            const data = await figma("/teams/" + teamId + "/projects")
            for (const p of data.projects || []) out.push({ id: p.id, project: p.name, deep: deep })
        } catch (e) {
            console.warn("Não consegui listar os projetos do time " + teamId + ": " + e.message)
        }
    }
    return out
}

async function versionsOf(key) {
    const all = []
    let url = "/files/" + key + "/versions"
    for (let guard = 0; url && guard < 50; guard++) {
        const data = await figma(url)
        all.push(...(data.versions || []))
        url = data.pagination && data.pagination.next_page ? data.pagination.next_page : null
    }
    return all
}

async function commentsOf(key) {
    const data = await figma("/files/" + key + "/comments")
    return data.comments || []
}

const files = [...(config.files || [])]
const projectList = [...(config.projectIds || [])]
if (config.teamIds && config.teamIds.length) projectList.push(...(await projectsFromTeams(config.teamIds, config.teamDeep === true)))
if (projectList.length) files.push(...(await filesFromProjects(projectList)))

// remove arquivos duplicados (se o mesmo arquivo vier de "files" e de um projeto, junta as informações)
const byKey = new Map()
for (const f of files) {
    const prev = byKey.get(f.key)
    if (!prev) byKey.set(f.key, { ...f })
    else if (f.modified && !prev.modified) prev.modified = f.modified
}
const uniqueFiles = [...byKey.values()]
if (uniqueFiles.length === 0) {
    console.error('Nenhum arquivo configurado. Preencha "files" em ' + CONFIG_PATH + ".")
    process.exit(1)
}

const myId = ONLY_ME ? await currentUserId() : null

// Mantém o histórico já coletado (a API pode deixar de listar versões antigas)
let existing = []
try {
    existing = JSON.parse(await readFile(OUTPUT, "utf8")).events || []
} catch {}
const byId = new Map(existing.filter((e) => e.id).map((e) => [e.id, e]))

let added = 0
for (const f of uniqueFiles) {
    const project = f.project || "Figma"
    // "Última modificação" do arquivo: um ponto por arquivo e por dia em que ele foi editado.
    // Rodando todo dia, isso vai montando o histórico. Não dá para saber QUEM editou.
    if (MODIFIED && f.modified && !isNaN(new Date(f.modified).getTime())) {
        const mid = "m:" + f.key + ":" + f.modified
        if (!byId.has(mid)) added++
        byId.set(mid, { id: mid, t: f.modified, project: project, kind: "modified" })
    }
    if (f.modifiedOnly) continue
    try {
        for (const v of await versionsOf(f.key)) {
            if (myId && (!v.user || v.user.id !== myId)) continue
            const id = "v:" + f.key + ":" + v.id
            if (!byId.has(id)) added++
            byId.set(id, { id: id, t: v.created_at, project: project, kind: "version" })
        }
    } catch (e) {
        console.warn("[" + project + "] versões: " + e.message)
    }
    try {
        for (const c of await commentsOf(f.key)) {
            if (myId && (!c.user || c.user.id !== myId)) continue
            const id = "c:" + f.key + ":" + c.id
            if (!byId.has(id)) added++
            byId.set(id, { id: id, t: c.created_at, project: project, kind: "comment" })
        }
    } catch (e) {
        console.warn("[" + project + "] comentários: " + e.message)
    }
}

const cutoff = Date.now() - KEEP_DAYS * 86400000
const events = [...byId.values()].filter((e) => new Date(e.t).getTime() >= cutoff).sort((a, b) => (a.t < b.t ? -1 : 1))

await mkdir(dirname(OUTPUT), { recursive: true })
await writeFile(OUTPUT, JSON.stringify({ updated: new Date().toISOString(), events: events }, null, 1) + "\n")
console.log(events.length + " eventos salvos em " + OUTPUT + " (" + added + " novos).")
