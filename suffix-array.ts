/* eslint-disable no-param-reassign */
/* eslint-disable class-methods-use-this */

/**
 * Build and return an autocomplete model based on an array of entry objects.
 *
 * Each entry must have a **'string'** property.
 * @param {entry[]} entries - An array of entry objects.
 *
 * Entry objects get returned when autocompleting.
 *
 * Each must contain a **'string'** property.
 * @returns {autocomplete}
 */
class AutoComplete<T> {
  private util = {
    normalizeString(string: string) {
      return string.toLocaleLowerCase()
    },
  }

  private suffixArray: number[] = []

  private entryIndex: Record<number, T> = {}

  private suffixArrayEntries: number[] = []

  private charArray: string[] = []

  private customStringFunction: (entry: T) => string

  constructor(entries: T[], customStringFunction: (entry: T) => string) {
    this.customStringFunction = customStringFunction
    this.build(entries)
  }

  private build(entries: T[]): void {
    this.charArray = this.getCharacterArray(entries)
    const charCodeArray = this.charArray.map((char: string) => char.charCodeAt(0))
    this.suffixArray = this.getSuffixArray(charCodeArray)
    this.entryIndex = this.getInputIndex(entries)
    const mappedChars = this.mapCharacterArray(this.charArray, this.entryIndex)
    this.suffixArrayEntries = this.suffixArray.map((pos) => mappedChars[pos].e)
  }

  private mapCharacterArray(
    charArray: string[],
    entryIndex: Record<number, T>,
  ): { c: string, e: number }[] {
    let currentEntryIndex: number
    return charArray.map((char, i) => {
      if (entryIndex[i]) currentEntryIndex = i
      return { c: char, e: currentEntryIndex } // {Character: char, Entry: i}
    })
  }

  private getCharacterArray(entries: T[]): string[] {
    return entries
      .map((entry) => [...this.util.normalizeString(this.customStringFunction(entry))]
      // Spread because '.split()' splits some emoji's in two.
        .concat(['\x00'])) // Add a character that'll map to zero after each string
      .flat()
  }

  private getSuffixArray(initialArray: number[]): number[] {
    const inputLength = initialArray.length
    const m0 = []
    const m1 = []
    const m2 = []
    for (let i = 0; i < inputLength; i += 1) {
      const k = i % 3
      if (k === 0) {
        m0.push(i)
        if (i === inputLength) m1.push(i + 1)
      } else if (k === 1) {
        m1.push(i)
      } else {
        m2.push(i)
      }
    }
    const m12 = m1.concat(m2)
    initialArray = initialArray.concat([0, 0, 0])

    let {
      // eslint-disable-next-line prefer-const
      rankedM12, sortedM12, m12Ranks, duplicatesFound,
    } = this.radixSortM12(
      m12,
      initialArray,
    )
    if (duplicatesFound) {
      rankedM12 = this.getSuffixArray(rankedM12)
      sortedM12 = rankedM12.map((index) => m12[index])
      m12Ranks = {}
      sortedM12.forEach((index, i) => { m12Ranks[index] = i })
    }

    const sortedM0 = this.radixSortM0(m0, m12Ranks, initialArray)

    const suffixArray = this.merge(initialArray, sortedM0, sortedM12, m12Ranks)
    return suffixArray
  }

  private radixSortM0(
    m0: number[],
    m12Ranks: Record<number, number>,
    inputArray: number[],
  ): number[] {
    let buckets: number[][] = []
    m0.forEach((index) => {
      const rank = m12Ranks[index + 1] || 0
      buckets[rank] ||= []
      buckets[rank].push(index)
    })
    const current = buckets.flat(1)
    buckets = []
    current.forEach((index) => {
      const value = inputArray[index]
      buckets[value] ||= []
      buckets[value].push(index)
    })
    const sortedM0: number[] = []
    buckets.forEach((bucket) => bucket.forEach((index) => sortedM0.push(index)))
    return sortedM0
  }

  private radixSortM12(m12: number[], inputArray: number[]): {
    duplicatesFound: boolean,
    rankedM12: number[],
    sortedM12: number[],
    m12Ranks: Record<number, number>
  } {
    let buckets: { pos: number; index: number }[][] = []
    m12.forEach((index, i) => {
      const value = inputArray[index + 2] || 0
      buckets[value] ||= []
      buckets[value].push({ pos: i, index })
    })
    for (let i = 1; i >= 0; i -= 1) {
      const tempBuckets: { pos: number; index: number }[][] = []
      buckets.forEach((bucket) => bucket.forEach((Obj) => {
        const value = inputArray[Obj.index + i] || 0
        tempBuckets[value] ||= []
        tempBuckets[value].push(Obj)
      }))
      buckets = tempBuckets
    }
    const rankedM12: number[] = []
    const sortedM12: number[] = []
    const m12Ranks: Record<number, number> = {}
    let duplicatesFound = false
    let currentRank = 0
    buckets.forEach((bucket) => bucket.forEach((Obj, i) => {
      const { pos, index } = Obj
      let hasDuplicate = false
      if (i !== 0) {
        const prevIndex = bucket[i - 1].index
        if (
          inputArray[prevIndex] === inputArray[index]
              && inputArray[prevIndex + 1] === inputArray[index + 1]
              && inputArray[prevIndex + 2] === inputArray[index + 2]
        ) {
          duplicatesFound = true
          hasDuplicate = true
        }
      }
      if (!hasDuplicate) currentRank += 1
      sortedM12.push(index)
      rankedM12[pos] = currentRank
      m12Ranks[index] = currentRank
    }))
    return {
      duplicatesFound, rankedM12, sortedM12, m12Ranks,
    }
  }

  private merge(
    input: number[],
    sortedM0: number[],
    sortedM12: number[],
    indexRanks: Record<number, number>,
  ): number[] {
    const sorted = []
    const m0Length = sortedM0.length
    const m12Length = sortedM12.length
    let m0Index = 0
    let m12Index = 0
    while (m0Index < m0Length && m12Index < m12Length) {
      const m0 = sortedM0[m0Index]
      const m12 = sortedM12[m12Index]
      const pushM0 = this.compare(m0, m12, indexRanks, input)
      if (pushM0) {
        sorted.push(sortedM0[m0Index])
        m0Index += 1
      } else {
        sorted.push(sortedM12[m12Index])
        m12Index += 1
      }
    }
    return sorted.concat(
      sortedM0.slice(m0Index),
      sortedM12.slice(m12Index),
    )
  }

  private compare(
    m0: number,
    m12: number,
    indexRanks: Record<number, number>,
    input: number[],
  ): boolean {
    if (m0 % 3 !== 0 && m12 % 3 !== 0) {
      return (indexRanks[m0] || 0) < (indexRanks[m12] || 0)
    }
    if (input[m0] === input[m12]) {
      return this.compare(m0 + 1, m12 + 1, indexRanks, input)
    }
    return input[m0] < input[m12]
  }

  private getInputIndex(input: T[]): Record<number, T> {
    let currIndex = 0
    const indexedInput: Record<number, T> = {}
    input.forEach((row) => {
      indexedInput[currIndex] = row
      currIndex += [...this.customStringFunction(row)].length + 1 // Emoji's length = 2
    })
    return indexedInput
  }

  /**
   * @global
   * @function remove
   * Remove entries from the model, returning a new model.
   *
   * Removal can be done through different methods.
   * @param {Object} Methods Object with the removal methods to apply
   * @param {String[]} Methods.strings
   * An array of strings where any entry with a matching **string** property will be removed.
   * @param {entry[]} Methods.entries An array of entries where any matching entry will be removed.
   *
   * Property order matters in deeper object levels, and doesn't account for function properties.
   * @param {function[]} Methods.filters
   * Filter functions to pass each entry though and remove ones that return **true**.
   * @returns
   */
  public remove({ strings, entries, filters }:
  { strings?: string[], entries?: T[], filters?: ((entry: T) => boolean)[] } = {})
    : AutoComplete<T> {
    let sortedEntryStrings: string[]
    if (entries) {
      sortedEntryStrings = entries.map((entry) => JSON.stringify(this.sortProps(entry)))
    }

    let newEntries: T[] = Object.values(JSON.parse(JSON.stringify(this.entryIndex)))
    newEntries = newEntries.filter((entry) => {
      if (filters) {
        if (!filters.every((filter) => filter(entry))) return false
      }
      if (strings) {
        if (strings.some((string) => this.customStringFunction(entry)
          .includes(string))) return false
      }
      if (entries) {
        const sortedEntry = JSON.stringify(this.sortProps(entry))
        if (sortedEntryStrings.includes(sortedEntry)) return false
      }
      return true
    })
    return new AutoComplete(newEntries, this.customStringFunction)
  }

  private sortProps(entry: T) {
    return Object.fromEntries(
      Object.entries(this.customStringFunction(entry)).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    ) // chris: should look into implications of
    // sortprops with the custom string instead of string field
  }

  /**
   * Create a new autocompleter instance with current model's entries and an array of new entries.
   * @param {entry[]} entries
   * @returns
   */
  public insert(entries: T[]): AutoComplete<T> {
    if (!(entries instanceof Array)) entries = [entries]
    const newEntries = Object.values(this.entryIndex).concat(entries)
    return new AutoComplete(newEntries, this.customStringFunction)
  }

  /**
   * Autocomplete a query and return all matching entries in the model.
   * @param {String} query Input query to autocomplete
   * @returns {entry[]}
   */
  public match(query: string): T[] {
    const normalizedQuery = [...this.util.normalizeString(query)]
    // Spread to maintain emojis, which have a length of two and mess with index matching
    const firstMatch = this.binarySearch(normalizedQuery)
    const lastMatch = this.binarySearch(normalizedQuery, { lastMatch: true })
    return this.getEntries(firstMatch, lastMatch)
  }

  private binarySearch(
    query: string[],
    { start = 0, end = this.suffixArray.length - 1, lastMatch = false } = {},
  ): number {
    if (start > end) return -1
    const midpoint = start + Math.floor((end - start) / 2)
    const suffixPos = this.suffixArray[midpoint]
    const { lcp, nextChar, isMatched } = this.getLCP(query, suffixPos, true)
    if (isMatched) {
      const neighborShift = lastMatch ? 1 : -1
      const neighborIndex = midpoint + neighborShift
      if (neighborIndex > this.suffixArray.length - 1 || neighborIndex < 0) {
        return midpoint
      }
      const neighborPos = this.suffixArray[neighborIndex]
      const neighborMatch = this.getLCP(query, neighborPos)
      if (!neighborMatch.isMatched) return midpoint;
      [start, end] = lastMatch ? [midpoint + 1, end] : [start, midpoint - 1]
      return this.binarySearch(query, { start, end, lastMatch })
    }
    [start, end] = query.join('') < lcp + nextChar ? [start, midpoint - 1] : [midpoint + 1, end]
    return this.binarySearch(query, { start, end, lastMatch })
  }

  private getLCP(query: string[], suffixPos: number, getNext = false) {
    let lcp = ''
    let isMatched = true
    let nextChar
    for (let i = 0; i < query.length; i += 1) {
      const suffixChar = this.charArray[suffixPos + i]
      if (query[i] !== suffixChar) {
        isMatched = false
        if (getNext) nextChar = suffixChar
        break
      }
      lcp = lcp.concat(suffixChar)
    }
    return { lcp, isMatched, nextChar }
  }

  private getEntries(start: number, end: number): T[] {
    const matchedIDs = new Set()
    const entries: T[] = []
    this.suffixArrayEntries.slice(start, end + 1).forEach((entryID) => {
      if (matchedIDs.has(entryID)) return
      matchedIDs.add(entryID)
      entries.push(this.entryIndex[entryID])
    })
    return entries
  }
}

export default AutoComplete

// Define the Entry type
type Guest = {
  text: string;
  note: string;
  extraField: string;
}

// Create an array of entries
const entries: Guest[] = [
  { text: 'Chris', note: 'Plus One', extraField: '2' },
  { text: 'Chris', note: 'VIP', extraField: '1' },
  { text: 'Christopher', note: 'Standard', extraField: '3' },
  { text: 'John', note: 'Friend of Chris', extraField: '4' },
]

// Create an instance of Autocompleter for name matching
const autocompleter = new AutoComplete<Guest>(entries, (guest) => `${guest.text} ${guest.note}`)

// Match a query based on the 'name' property
const query = 'C'
const matches = autocompleter.match(query)
console.log('Matches for query:', query, matches)

// Insert new entries
const newEntries: Guest[] = [
  { text: 'Christian', note: 'Plus Two', extraField: '5' },
  { text: 'Chloe', note: 'Guest', extraField: '6' },
]
const updatedAutocompleter = autocompleter.insert(newEntries)

// Match again with new entries
const newMatches = updatedAutocompleter.match('C')
console.log('Matches after insertion:', newMatches)

// Remove entries
const removedAutocompleter = updatedAutocompleter.remove({ strings: ['Christopher'] })

// Match again after removal
const matchesAfterRemoval = removedAutocompleter.match('C')
console.log('Matches after removal:', matchesAfterRemoval)
