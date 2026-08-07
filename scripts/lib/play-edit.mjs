export async function abandonEdit(client, editId, { log = console.error } = {}) {
  try {
    await client.deleteEdit(editId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Failed to abandon Play edit ${editId}: ${message}`);
  }
}
