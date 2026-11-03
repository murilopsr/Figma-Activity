// Coleta versões, comentários e datas dos seus arquivos do Figma e gera public/figma-activity.json
// Requer Node 18+ (fetch nativo). Sem dependências.
//
// PRIVACIDADE: o JSON público só guarda data/hora, tipo (version/comment/touched/created)
// e um código opaco (hash). Chaves de arquivo e nomes de projeto NÃO são gravados, e os
// logs mostram "arquivo #N" em vez de nomes. O config (com as chaves) deve ficar fora do
// repositório, no secret FIGMA_CONFIG.
//
// Uso local:
//   FIGMA_TOKEN=figd_xxx CONFIG_PATH=./meu-config.json node scripts/fetch-figma-activity.mjs
//
// Escopos mínimos do token: current_user:read, file_versions:read, file_comments:read, file_metadata:read

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
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
const META = config.metaEvents !== false // datas de criação e última edição de cada arquivo
const MODIFIED = config.modifiedEvents === true // "última modificação" dos arquivos de projectIds/teamIds
const INCLUDE_PROJECTS = config.includeProjects === true // se true, grava o nome do projeto no JSON (não recomendado em repositório público)
const SALT = config.idSalt || ""

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// código opaco: não permite recuperar a chave do arquivo
const oid = (s) => createHash("sha256").update(SALT + s).digest("hex").slice(0, 16)
// esconde IDs de arquivos/projetos/times nas mensagens de erro (os logs do GitHub Actions são públicos em repositórios públicos)
const mask = (s) => String(s).replace(/\/(files|projects|teams)\/[^/?"\s]+/g, "/$1/…")

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
        const err = new Error("Figma API " + res.status + " em " + mask(path) + ": " + mask(body.slice(0, 2000)))
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
    let n = 0
    for (const p of projectIds) {
        n++
        const id = typeof p === "string" ? p : p.id
        const label = typeof p === "string" ? undefined : p.project
        const deep = typeof p === "object" && p.deep === true // true = também busca versões e comentários de cada arquivo
        try {
            const data = await figma("/projects/" + id + "/files")
            for (const f of data.files || []) out.push({ key: f.key, project: label || data.name || "projeto", modified: f.last_modified, modifiedOnly: !deep })
        } catch (e) {
            console.warn("Não consegui listar o projeto #" + n + ": " + e.message)
        }
    }
    return out
}

// Descobre todos os projetos (pastas) de cada time informado em "teamIds"
async function projectsFromTeams(teamIds, deep) {
    const out = []
    let n = 0
    for (const teamId of teamIds) {
        n++
        try {
            const data = await figma("/teams/" + teamId + "/projects")
            for (const p of data.projects || []) out.push({ id: p.id, project: p.name, deep: deep })
        } catch (e) {
            console.warn("Não consegui listar os projetos do time #" + n + ": " + e.message)
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

async function metaOf(key) {
    const data = await figma("/files/" + key + "/meta")
    return data.file || data
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
    console.error('Nenhum arquivo configurado. Preencha "files" no config (secret FIGMA_CONFIG).')
    process.exit(1)
}
console.log(uniqueFiles.length + " arquivos configurados.")

const myId = ONLY_ME ? await currentUserId() : null

// Mantém o histórico já coletado (a API pode deixar de listar versões antigas).
// Ids antigos (com a chave do arquivo) são convertidos em códigos opacos e o nome do projeto é descartado.
let existing = []
try {
    existing = JSON.parse(await readFile(OUTPUT, "utf8")).events || []
} catch {}
const byId = new Map()
for (const e of existing) {
    if (!e || !e.id || !e.t) continue
    const id = /^[vctmn]:/.test(e.id) ? oid(e.id) : e.id
    const ev = { id: id, t: e.t, kind: e.kind }
    if (INCLUDE_PROJECTS && e.project) ev.project = e.project
    byId.set(id, ev)
}

let added = 0
const put = (rawId, t, kind, project) => {
    const id = oid(rawId)
    if (!byId.has(id)) added++
    const ev = { id: id, t: t, kind: kind }
    if (INCLUDE_PROJECTS) ev.project = project
    byId.set(id, ev)
}

let metaLogged = false
let index = 0
for (const f of uniqueFiles) {
    index++
    const tag = "arquivo #" + index
    const project = f.project || "Figma"
    // "Última modificação" do arquivo (um ponto por arquivo e por data). Não dá para saber QUEM editou.
    if (MODIFIED && f.modified && !isNaN(new Date(f.modified).getTime())) put("m:" + f.key + ":" + f.modified, f.modified, "modified", project)
    // Metadados do arquivo: dia da última edição e dia de criação
    if (META) {
        try {
            const m = await metaOf(f.key)
            if (!metaLogged) {
                console.log("Campos do metadata: " + Object.keys(m).join(", "))
                metaLogged = true
            }
            const mine = (u) => !myId || !u || u.id === myId
            const valid = (t) => t && !isNaN(new Date(t).getTime())
            const touched = m.last_touched_at || m.lastTouchedAt
            if (valid(touched) && mine(m.last_touched_by || m.lastTouchedBy)) put("t:" + f.key + ":" + touched, touched, "touched", project)
            const created = m.created_at || m.createdAt
            if (valid(created) && mine(m.creator)) put("n:" + f.key, created, "created", project)
        } catch (e) {
            console.warn("[" + tag + "] metadados: " + e.message)
        }
    }
    if (f.modifiedOnly) continue
    try {
        for (const v of await versionsOf(f.key)) {
            if (myId && (!v.user || v.user.id !== myId)) continue
            put("v:" + f.key + ":" + v.id, v.created_at, "version", project)
        }
    } catch (e) {
        console.warn("[" + tag + "] versões: " + e.message)
    }
    try {
        for (const c of await commentsOf(f.key)) {
            if (myId && (!c.user || c.user.id !== myId)) continue
            put("c:" + f.key + ":" + c.id, c.created_at, "comment", project)
        }
    } catch (e) {
        console.warn("[" + tag + "] comentários: " + e.message)
    }
}

const cutoff = Date.now() - KEEP_DAYS * 86400000
const events = [...byId.values()].filter((e) => new Date(e.t).getTime() >= cutoff).sort((a, b) => (a.t < b.t ? -1 : 1))

await mkdir(dirname(OUTPUT), { recursive: true })
await writeFile(OUTPUT, JSON.stringify({ updated: new Date().toISOString(), events: events }, null, 1) + "\n")
console.log(events.length + " eventos salvos em " + OUTPUT + " (" + added + " novos).")
