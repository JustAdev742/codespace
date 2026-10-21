// Available in every runtime the engine targets (Node 22, modern browsers),
// but not part of the plain ES lib the engine compiles against.
declare function structuredClone<T>(value: T): T;
