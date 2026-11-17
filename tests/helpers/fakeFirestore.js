// A small in-memory stand-in for the Admin SDK Firestore: just the calls server/db/*.js makes.
// Values are stored as JSON; timestamps are { __ts: n } and come back with .toDate() like the real Timestamp.
export function createFakeFirestore() {
  const docs = new Map()   // 'users/alice/resumes/r1' -> JSON string
  const stats = { reads: 0, writes: 0 }
  let clock = 1_700_000_000_000

  const revive = value => {
    if (Array.isArray(value)) return value.map(revive)
    if (value && typeof value === 'object') {
      if ('__ts' in value) return { __ts: value.__ts, toDate: () => new Date(value.__ts) }   // survives being written back
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, revive(item)]))
    }
    return value
  }
  const snapshotOf = path => {
    const raw = docs.get(path)
    return { exists: raw !== undefined, id: path.split('/').pop(), ref: refOf(path), data: () => (raw === undefined ? undefined : revive(JSON.parse(raw))) }
  }
  const setPath = (object, dotted, value) => {
    const keys = dotted.split('.')
    let target = object
    for (const key of keys.slice(0, -1)) target = target[key] ??= {}
    target[keys.at(-1)] = value
  }
  const isChildOf = (collectionPath, path) => path.startsWith(`${collectionPath}/`) && !path.slice(collectionPath.length + 1).includes('/')

  function refOf(path) {
    return {
      path,
      id: path.split('/').pop(),
      collection: name => collectionOf(`${path}/${name}`),
      get: async () => { stats.reads += 1; return snapshotOf(path) },
      set: async (value, options) => {
        stats.writes += 1
        if (!options?.merge) { docs.set(path, JSON.stringify(value)); return }
        // merge: top-level fields only; { __inc: n } adds to a number like FieldValue.increment
        const current = docs.has(path) ? JSON.parse(docs.get(path)) : {}
        for (const [key, item] of Object.entries(value)) current[key] = item && typeof item === 'object' && '__inc' in item ? (current[key] ?? 0) + item.__inc : item
        docs.set(path, JSON.stringify(current))
      },
      delete: async () => { stats.writes += 1; docs.delete(path) },
      update: async changes => {
        if (!docs.has(path)) throw Object.assign(new Error('NOT_FOUND'), { code: 5 })
        stats.writes += 1
        const current = JSON.parse(docs.get(path))
        for (const [key, value] of Object.entries(changes)) setPath(current, key, value)
        docs.set(path, JSON.stringify(current))
      }
    }
  }

  const compare = { '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, '==': (a, b) => a === b }

  function collectionOf(path) {
    const query = (field, direction, max, filters = []) => ({
      orderBy: (nextField, nextDirection = 'asc') => query(nextField, nextDirection, max, filters),
      limit: count => query(field, direction, count, filters),
      // Like Firestore, a range filter skips documents that don't have the field.
      where: (whereField, op, value) => query(field, direction, max, [...filters, [whereField, op, value]]),
      select: () => query(field, direction, max, filters),   // field masks don't matter in memory
      get: async () => {
        let rows = [...docs.keys()].filter(key => isChildOf(path, key)).map(snapshotOf)
        rows = rows.filter(row => filters.every(([whereField, op, value]) => {
          const actual = JSON.parse(docs.get(row.ref.path))[whereField]
          return actual !== undefined && compare[op](actual, value)
        }))
        if (field) {
          const sortKey = row => { const value = JSON.parse(docs.get(row.ref.path))[field]; return value && typeof value === 'object' && '__ts' in value ? value.__ts : value }
          // Like Firestore, ties fall back to the document id in the same direction.
          const order = (x, y) => (x > y ? 1 : x < y ? -1 : 0)
          rows.sort((a, b) => (order(sortKey(a), sortKey(b)) || order(a.ref.path, b.ref.path)) * (direction === 'desc' ? -1 : 1))
        }
        if (max) rows = rows.slice(0, max)
        stats.reads += rows.length
        return { docs: rows, empty: rows.length === 0 }
      }
    })
    return { path, doc: id => refOf(`${path}/${id}`), ...query(null, 'asc', null) }
  }

  return {
    stats,
    docs,
    collection: name => collectionOf(name),
    timestamp: () => ({ __ts: (clock += 1000) }),
    increment: amount => ({ __inc: amount }),
    async runTransaction(work) {
      const pending = []
      const transaction = {
        get: ref => ref.get(),
        set: (ref, value, options) => { pending.push(['set', ref, value, options]) },
        update: (ref, changes) => { pending.push(['update', ref, changes]) },
        delete: ref => { pending.push(['delete', ref]) }
      }
      const result = await work(transaction)
      for (const [action, ref, value, options] of pending) await (action === 'update' ? ref.update(value) : action === 'delete' ? ref.delete() : ref.set(value, options))
      return result
    },
    async recursiveDelete(ref) {
      for (const key of [...docs.keys()]) if (key === ref.path || key.startsWith(`${ref.path}/`)) { docs.delete(key); stats.writes += 1 }
    },
    // Test helpers
    seed: (path, value) => docs.set(path, JSON.stringify(value)),
    read: path => (docs.has(path) ? JSON.parse(docs.get(path)) : undefined)
  }
}
