.PHONY: build-viewer

build-viewer:
	npx vite build --config vite.config.local.js
	mv dist-local/local.html dist-local/index.html
	rm -rf ../smartmemory-claude-code/smartmemory_cc/static
	cp -r dist-local ../smartmemory-claude-code/smartmemory_cc/static
