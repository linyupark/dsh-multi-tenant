/** CSS Modules surface: importing `x.module.css` yields the hashed class map. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
