import { getClient } from "@/modules/database/internal/client";
import { MongoClient } from "mongodb";
export const uri = process.env.MONGODB_URI;
export const probe = [getClient, MongoClient];
