export class OnvifUnsupportedOperationError extends Error {
  constructor() {
    super("A câmera não suporta esta função ONVIF.");
    this.name = "OnvifUnsupportedOperationError";
  }
}
