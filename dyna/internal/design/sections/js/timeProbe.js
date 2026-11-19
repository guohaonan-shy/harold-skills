function timeProbe() {
  return { ready: (page) => !!page.__dsTime };
}