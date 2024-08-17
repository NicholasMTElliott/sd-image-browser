# https://hub.docker.com/_/microsoft-dotnet
FROM mcr.microsoft.com/dotnet/sdk:9.0-preview AS build
WORKDIR /source

# copy csproj and restore as distinct layers
COPY *.sln .
COPY *.csproj .
RUN dotnet restore dotnet-backend.generated.sln

# copy everything else and build app
COPY . .
WORKDIR /source
RUN dotnet publish -c release -o /app dotnet-backend.generated.sln

# final stage/image
FROM mcr.microsoft.com/dotnet/aspnet:9.0-preview
WORKDIR /app
COPY --from=build /app ./
ENTRYPOINT ["dotnet", "dotnet-backend.dll"]
