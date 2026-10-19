# Host tests for the prop's hardware-independent logic: `make` builds and runs them.
CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Wpedantic
SRC = ../PortalGunProp/portal_core.cpp test_portal_core.cpp

test: test_portal_core
	./test_portal_core

test_portal_core: $(SRC) ../PortalGunProp/portal_core.h
	$(CXX) $(CXXFLAGS) -o $@ $(SRC) -lm

clean:
	rm -f test_portal_core

.PHONY: test clean
