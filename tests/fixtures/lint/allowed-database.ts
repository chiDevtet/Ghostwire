import { MongoClient } from "mongodb";
import { loadConfig } from "@/modules/config";

export const allowed = [MongoClient, loadConfig];
