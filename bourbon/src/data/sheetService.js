import { SEED_BOURBONS } from './seedData.js'

// Google Sheet ID from user request
const SHEET_ID = '1XfZCAILlqCNuPkpAJ3alZc8XOBMFu4M24dH-mTrhlrA'
const DEFAULT_TAB = 'Sheet1'

function buildCsvUrl(sheetId, tabName = DEFAULT_TAB) {
  const encoded = encodeURIComponent(tabName)
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encoded}`
}

function parseCsv(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const parseRow = (line) => {
    const result = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = parseRow(lines[i]).map((v) => v.replace(/^"|"$/g, '').trim())
    if (vals.every((v) => v === '')) continue
    const obj = {}
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? ''
    })
    rows.push(obj)
  }
  return rows
}

export function parseMoney(val) {
  if (!val && val !== 0) return null
  const cleaned = String(val).replace(/[$,\s]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function extractDistillery(name) {
  if (!name) return 'Distillery Unknown'
  const lower = name.toLowerCase()

  if (lower.startsWith('1792')) return 'Barton 1792 Distillery'
  if (lower.startsWith('2xo')) return '2XO / Dixon Dedman'
  if (lower.includes('angel’s envy') || lower.includes("angel's envy")) return "Angel's Envy Distillery"
  if (lower.startsWith('asw')) return 'ASW Distillery (Atlanta, GA)'
  if (lower.startsWith('baker')) return 'Jim Beam / Clermont'
  if (lower.startsWith('balcones')) return 'Balcones Distilling'
  if (lower.startsWith('balvenie')) return 'The Balvenie'
  if (lower.startsWith('bardstown')) return 'Bardstown Bourbon Co.'
  if (lower.startsWith('basil')) return 'Jim Beam'
  if (lower.startsWith('blanton')) return 'Buffalo Trace Distillery'
  if (lower.startsWith('booker')) return 'Jim Beam'
  if (lower.startsWith('buffalo trace')) return 'Buffalo Trace Distillery'
  if (lower.startsWith('bulleit')) return 'Bulleit Distilling Co.'
  if (lower.startsWith('eagle rare')) return 'Buffalo Trace Distillery'
  if (lower.startsWith('eh taylor') || lower.startsWith('e.h. taylor')) return 'Buffalo Trace Distillery'
  if (lower.startsWith('elijah craig')) return 'Heaven Hill Distillery'
  if (lower.startsWith('evan williams')) return 'Heaven Hill Distillery'
  if (lower.startsWith('four roses')) return 'Four Roses Distillery'
  if (lower.startsWith('george t. stagg') || lower.startsWith('stagg')) return 'Buffalo Trace Distillery'
  if (lower.startsWith('heaven hill')) return 'Heaven Hill Distillery'
  if (lower.startsWith('high west')) return 'High West Distillery'
  if (lower.startsWith('jack daniel')) return "Jack Daniel's Distillery"
  if (lower.startsWith('knob creek')) return 'Jim Beam / Clermont'
  if (lower.startsWith('maker')) return "Maker's Mark"
  if (lower.startsWith('michter')) return "Michter's Distillery"
  if (lower.startsWith('old forester')) return 'Brown-Forman'
  if (lower.startsWith('old rip') || lower.includes('van winkle') || lower.includes('pappy')) return 'Buffalo Trace Distillery'
  if (lower.startsWith("russell") || lower.startsWith('wild turkey')) return 'Wild Turkey Distillery'
  if (lower.startsWith('weller')) return 'Buffalo Trace Distillery'
  if (lower.startsWith('whistlepig')) return 'WhistlePig'
  if (lower.startsWith('woodford')) return 'Woodford Reserve'

  // Default fallback: first two words
  const words = name.split(/\s+/)
  return words.slice(0, Math.min(2, words.length)).join(' ')
}

function extractType(name) {
  if (!name) return 'Bourbon'
  const lower = name.toLowerCase()

  if (lower.includes('single malt')) return 'Single Malt'
  if (lower.includes('rye')) return 'Rye Whiskey'
  if (lower.includes('sweet wheat') || lower.includes('wheated') || lower.includes('fiddler wheated') || lower.includes('weller') || lower.includes('maker') || lower.includes('van winkle')) {
    return 'Wheated Bourbon'
  }
  if (lower.includes('cask strength') || lower.includes('barrel proof') || lower.includes('hazmat') || lower.includes('full proof')) {
    return 'Barrel Proof'
  }
  if (lower.includes('bottle in bond') || lower.includes('bottled in bond')) {
    return 'Bottled in Bond'
  }
  if (lower.includes('single barrel')) return 'Single Barrel'
  if (lower.includes('small batch')) return 'Small Batch'
  if (lower.includes('finished') || lower.includes('cask finish') || lower.includes('oak series') || lower.includes('caribbean rum') || lower.includes('french oak')) {
    return 'Finished / Specialty'
  }

  return 'Bourbon'
}

function extractAge(name) {
  if (!name) return ''
  const m = name.match(/(\d+)\s*(?:Year|Yr|yr|year)/i)
  return m ? `${m[1]} Yr` : ''
}

function extractProof(name) {
  if (!name) return null
  const m = name.match(/(\d{2,3}(?:\.\d+)?)\s*(?:Proof|proof|°)/)
  if (m) return parseFloat(m[1])
  if (/bottle in bond|bottled in bond/i.test(name)) return 100
  if (/weller antique 107/i.test(name)) return 107
  if (/weller 12/i.test(name) || /weller special reserve/i.test(name)) return 90
  return null
}

function normalizeRecord(raw) {
  // Columns in the Sprig Google Sheet:
  // "Value Rating", "Bottle Name", "Sprig Pour Price", "Raw 2oz Cost", "Standard MSRP (750ml)", "Fair 2oz Price (3.6x)", "Sync Status", "Last Sync"

  const find = (...terms) => {
    const keys = Object.keys(raw)
    for (const term of terms) {
      const t = term.toLowerCase()
      const key = keys.find((k) => k.toLowerCase().trim() === t || k.toLowerCase().includes(t))
      if (key !== undefined && raw[key] !== '') return raw[key]
    }
    return ''
  }

  const name = find('bottle name', 'name', 'bourbon', 'label') || 'Unknown Bottle'
  const valueRating = find('value rating', 'rating', 'grade') // "A+ (Steal)", "A (Great Value)", "C (Slight Premium)", "F (Gouging)", etc.
  const sprigPrice = parseMoney(find('sprig pour price', 'sprig price', 'price', 'pour'))
  const rawCost = parseMoney(find('raw 2oz cost', 'raw cost', 'cost'))
  const msrp = parseMoney(find('standard msrp (750ml)', 'msrp', 'retail'))
  const fairPrice = parseMoney(find('fair 2oz price (3.6x)', 'fair price', 'fair 2oz price', 'fair'))
  const syncStatus = find('sync status', 'status') || 'Matched'
  const lastSync = find('last sync', 'sync date')

  // Calculate Value Score % (Fair 2oz Price vs Sprig Pour Price)
  let valueScore = null
  if (fairPrice && sprigPrice && fairPrice > 0) {
    // Value score = savings % vs fair bar price (3.6x margin)
    valueScore = Math.round(((fairPrice - sprigPrice) / fairPrice) * 100)
  } else if (rawCost && sprigPrice && rawCost > 0) {
    // Alternative markup analysis
    const markup = sprigPrice / rawCost
    valueScore = Math.round((3.6 - markup) * 20)
  }

  // Value Rating Tier Normalization
  // Values: "A+ (Steal)", "A (Great Value)", "B (Fair/Standard)", "C (Slight Premium)", "D (Overpriced)", "F (Gouging)", "Missing from Master Registry", "N/A"
  let tier = 'unknown'
  let isUnicorn = false

  const vr = valueRating.toUpperCase()
  if (vr.includes('A+') || vr.includes('STEAL')) {
    tier = 'unicorn'
    isUnicorn = true
  } else if (vr.startsWith('A') || vr.includes('GREAT VALUE')) {
    tier = 'strong'
  } else if (vr.startsWith('B') || vr.includes('FAIR') || vr.includes('STANDARD')) {
    tier = 'fair'
  } else if (vr.startsWith('C') || vr.includes('SLIGHT PREMIUM')) {
    tier = 'fair'
  } else if (vr.startsWith('D') || vr.startsWith('F') || vr.includes('GOUGING') || vr.includes('OVERPRICED')) {
    tier = 'weak'
  } else if (valueScore !== null) {
    if (valueScore >= 35) { tier = 'unicorn'; isUnicorn = true }
    else if (valueScore >= 15) tier = 'strong'
    else if (valueScore >= -5) tier = 'fair'
    else tier = 'weak'
  }

  const distillery = extractDistillery(name)
  const type = extractType(name)
  const age = extractAge(name)
  const proof = extractProof(name)

  return {
    id: name
      ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : Math.random().toString(36).slice(2, 10),
    name,
    valueRating: valueRating || (isUnicorn ? 'A+ (Steal)' : tier === 'strong' ? 'A (Great Value)' : tier === 'fair' ? 'B (Fair)' : 'C'),
    distillery,
    type,
    age,
    proof,
    sprigPrice,
    rawCost,
    msrp,
    fairPrice,
    valueScore,
    isUnicorn,
    tier,
    syncStatus,
    lastSync,
    notes: `${type}${age ? ` · ${age}` : ''}${proof ? ` · ${proof}°` : ''}${fairPrice ? ` · Fair: $${fairPrice.toFixed(2)}` : ''}`,
    raw,
  }
}

/**
 * Fetch and parse data from the Sprig Google Sheet.
 * Direct CSV gviz endpoint &rarr; Worker proxy &rarr; Local Seed Catalog fallback.
 */
export async function fetchBourbonData() {
  const gvizUrl = buildCsvUrl(SHEET_ID, DEFAULT_TAB)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    const resp = await fetch(gvizUrl, {
      cache: 'no-cache',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (resp.ok) {
      const text = await resp.text()
      if (text && !text.includes('<!DOCTYPE html>') && !text.includes('<html')) {
        const rows = parseCsv(text)
        if (rows.length > 0) {
          const headers = Object.keys(rows[0])
          const parsed = rows
            .map(normalizeRecord)
            .filter((r) => r.name !== 'Unknown Bottle' && r.name !== 'Bottle Name')

          if (parsed.length > 0) {
            console.log(`Successfully ingested ${parsed.length} bourbons from Sprig Google Sheet.`)
            return {
              data: parsed,
              headers,
              lastUpdated: new Date(),
              source: 'google-sheet',
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Google Sheet CSV direct fetch warning:', err.message)
  }

  // Attempt local Worker proxy endpoint
  try {
    const proxyResp = await fetch('/api/bourbon/data', { cache: 'no-cache' })
    if (proxyResp.ok) {
      const text = await proxyResp.text()
      const rows = parseCsv(text)
      if (rows.length > 0) {
        const parsed = rows
          .map(normalizeRecord)
          .filter((r) => r.name !== 'Unknown Bottle' && r.name !== 'Bottle Name')

        if (parsed.length > 0) {
          return {
            data: parsed,
            headers: Object.keys(rows[0]),
            lastUpdated: new Date(),
            source: 'worker-proxy',
          }
        }
      }
    }
  } catch (err) {
    console.warn('Worker proxy endpoint not reachable:', err.message)
  }

  // Fallback to verified seed catalog
  console.info('Using verified Sprig Bourbon Sommelier seed catalog.')
  return {
    data: SEED_BOURBONS,
    headers: ['Value Rating', 'Bottle Name', 'Sprig Pour Price', 'Raw 2oz Cost', 'Standard MSRP (750ml)', 'Fair 2oz Price (3.6x)'],
    lastUpdated: new Date(),
    source: 'seed-catalog',
  }
}
