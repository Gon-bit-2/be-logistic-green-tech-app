const generateTrackingCode = (): string => {
  let result = 'GONLG'
  for (let i = 0; i < 10; i++) {
    result += Math.floor(Math.random() * 10).toString()
  }
  return result
}
export { generateTrackingCode }
