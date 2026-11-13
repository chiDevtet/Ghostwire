import { MongoClient } from "mongodb";

export async function probe(): Promise<unknown> {
  const driver = await import("mongodb");
  return [MongoClient, driver];
}
