import parseScheme from 'cerebral-scheme-parser'
import populateInputAndStateSchemes from './helpers/populateInputAndStateSchemes'

export default function (path, value) {
  const pathScheme = parseScheme(path)
  const valueScheme = typeof value === 'string' ? parseScheme(value) : value

  if (pathScheme.target !== 'state') {
    throw new Error('Cerebral operator SET - The path: "' + path + '" does not target "state"')
  }

  if (
    valueScheme &&
    valueScheme.target &&
    valueScheme.target !== 'input' &&
    valueScheme.target !== 'state'
  ) {
    throw new Error('Cerebral operator SET - The value: "' + path + '" does not target "input" or "state"')
  }
  const set = function set ({input, state}) {
    const pathSchemeValue = pathScheme.getValue(populateInputAndStateSchemes(input, state))
    let valueSchemeValue = value

    if (valueScheme && valueScheme.target && valueScheme.target === 'input') {
      valueSchemeValue = input[valueScheme.getValue(populateInputAndStateSchemes(input, state))]
    } else if (valueScheme && valueScheme.target && valueScheme.target === 'state') {
      valueSchemeValue = state.get(valueScheme.getValue(populateInputAndStateSchemes(input, state)))
    }

    state.set(pathSchemeValue, valueSchemeValue)
  }

  set.displayName = 'operator SET'

  return set
}
