-- CHECK constraint: a room cannot be booked or held beyond its physical count
ALTER TABLE "Inventory" ADD CONSTRAINT inventory_capacity_check CHECK ("bookedRooms" + "heldRooms" <= "totalRooms");

-- Full-text GIN index on properties for search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS properties_fulltext_idx
  ON "Property" USING GIN (
    to_tsvector('english',
      coalesce("name", '') || ' ' ||
      coalesce("city", '') || ' ' ||
      coalesce("description", '')
    )
  );
CREATE INDEX IF NOT EXISTS properties_name_trgm_idx ON "Property" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS properties_city_trgm_idx ON "Property" USING GIN ("city" gin_trgm_ops);
