export function getElectronApi() {
  if (typeof window !== "undefined" && window.digoAPI) {
    return window.digoAPI;
  }

  return null;
}