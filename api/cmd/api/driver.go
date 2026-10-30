//go:build !nodriver

package main

// Driver PostgreSQL (pgx) untuk database/sql.
import _ "github.com/jackc/pgx/v5/stdlib"

const driverName = "pgx"
