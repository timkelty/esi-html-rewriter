declare module "cloudflare:test" {
  interface ProvidedEnv {
    // Add any test-specific bindings here if needed
  }
}

declare module "*?raw" {
  const content: string;
  export default content;
}
